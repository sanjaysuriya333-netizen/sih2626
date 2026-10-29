const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const audit = require('./audit'); // called as audit.logAction so tests can spy on it
const notifyService = require('./notifyService'); // same reason
const proofFiles = require('./proofFiles');
const { scopeApplications } = require('./scope');
const { startOfUtcDay } = require('./workingDays');
const { todayInIst } = require('../jobs/dailyCheck');

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (d) => d.toISOString().slice(0, 10);
const daysBetween = (from, to) =>
  Math.round((startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / DAY_MS);

// A document, only if its application is inside the caller's data scope
function findScopedDocument(user, id) {
  return prisma.document.findFirst({
    where: { AND: [{ id }, { application: { is: scopeApplications(user) } }] },
    include: {
      application: { select: { id: true, appCode: true, institutionId: true, assignedOfficerId: true } },
    },
  });
}

// A renewal proof (owner_type DOCUMENT) plus its scoped document, or null
async function findScopedDocumentProof(user, proofId) {
  const proof = await prisma.proof.findUnique({ where: { id: proofId } });
  if (!proof || proof.ownerType !== 'DOCUMENT') return null;
  const document = await findScopedDocument(user, proof.ownerId);
  return document ? { proof, document } : null;
}

// Adds a document and its DOCUMENT obligation (due on expiry) in ONE transaction.
// The 90/60/30-day reminders are sent by the daily job from alert_rules.
async function createDocument(user, { applicationId, docType, validUntil }) {
  const application = await prisma.application.findFirst({
    where: { AND: [{ id: applicationId }, scopeApplications(user)] },
  });
  if (!application) throw new HttpError(404, 'NOT_FOUND', 'Application not found');
  if (!application.assignedOfficerId) throw new HttpError(409, 'NO_OFFICER', 'The file has no assigned officer');

  const until = startOfUtcDay(validUntil);
  if (until < todayInIst()) throw new HttpError(400, 'VALIDATION_ERROR', 'validUntil cannot be in the past');

  const existing = await prisma.document.count({
    where: {
      applicationId,
      status: { in: ['VALID', 'EXPIRED'] },
      docType: { equals: docType, mode: 'insensitive' },
    },
  });
  if (existing > 0) {
    throw new HttpError(409, 'ALREADY_EXISTS', 'This document already exists on the file, renew it instead');
  }

  return prisma.$transaction(async (tx) => {
    const doc = await tx.document.create({ data: { applicationId, docType, validUntil: until } });
    const obligation = await tx.obligation.create({
      data: {
        kind: 'DOCUMENT',
        refId: doc.id,
        applicationId,
        ownerId: application.assignedOfficerId,
        dueDate: until,
      },
    });
    await audit.logAction(
      {
        userId: user.id,
        action: 'DOCUMENT_CREATED',
        entity: 'document',
        entityId: doc.id,
        after: { applicationId, appCode: application.appCode, docType, validUntil: isoDay(until), obligationId: obligation.id },
      },
      tx,
    );
    return { id: doc.id, applicationId, docType, validUntil: until, status: doc.status, obligationId: obligation.id };
  });
}

// Documents the caller may see. expiringWithinDays keeps VALID and EXPIRED documents whose
// expiry is within that many calendar days (already expired ones included).
async function listDocuments(user, { status, applicationId, expiringWithinDays, page, pageSize }) {
  const today = todayInIst();
  const filters = {};
  if (status) filters.status = status;
  if (applicationId) filters.applicationId = applicationId;
  if (expiringWithinDays) {
    filters.validUntil = { lte: new Date(today.getTime() + expiringWithinDays * DAY_MS) };
    if (!status) filters.status = { in: ['VALID', 'EXPIRED'] };
  }
  const where = { AND: [{ application: { is: scopeApplications(user) } }, filters] };

  const [total, rows] = await Promise.all([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where,
      orderBy: [{ validUntil: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { application: { select: { appCode: true, institution: { select: { name: true } } } } },
    }),
  ]);
  const ids = rows.map((r) => r.id);
  const obligations = ids.length
    ? await prisma.obligation.findMany({
        where: { kind: 'DOCUMENT', refId: { in: ids } },
        select: { refId: true, state: true },
      })
    : [];
  const proofs = ids.length
    ? await prisma.proof.findMany({
        where: { ownerType: 'DOCUMENT', ownerId: { in: ids } },
        orderBy: { id: 'asc' },
      })
    : [];

  const data = rows.map((d) => {
    const mine = proofs.filter((p) => p.ownerId === d.id);
    const pending = d.renewalValidUntil ? [...mine].reverse().find((p) => p.verifiedStatus === 'PENDING') : null;
    const ob = obligations.find((o) => o.refId === d.id);
    return {
      id: d.id,
      applicationId: d.applicationId,
      appCode: d.application.appCode,
      institutionName: d.application.institution.name,
      docType: d.docType,
      validUntil: d.validUntil,
      status: d.status,
      daysToExpiry: daysBetween(today, d.validUntil),
      obligationState: ob ? ob.state : null,
      replacedById: d.replacedById,
      closedOn: d.closedOn,
      renewal: pending
        ? { proofId: pending.id, uploadedOn: pending.uploadedOn, newValidUntil: d.renewalValidUntil }
        : null,
      proofs: mine.map((p) => ({ id: p.id, uploadedOn: p.uploadedOn, verifiedStatus: p.verifiedStatus, remarks: p.remarks })),
    };
  });
  return { data, total };
}

// Institution uploads the renewal. The file is written first, then the database change runs in
// ONE transaction; if that fails, the file is deleted again.
async function requestRenewal(user, documentId, file, newValidUntil) {
  const doc = await findScopedDocument(user, documentId);
  if (!doc) throw new HttpError(404, 'NOT_FOUND', 'Document not found');
  if (doc.status === 'REPLACED') throw new HttpError(409, 'ALREADY_REPLACED', 'This document was already renewed');
  if (doc.renewalValidUntil) throw new HttpError(409, 'RENEWAL_PENDING', 'A renewal is already waiting for an officer');

  const newUntil = startOfUtcDay(newValidUntil);
  if (newUntil <= startOfUtcDay(doc.validUntil) || newUntil <= todayInIst()) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'The new expiry must be later than the current expiry and in the future');
  }
  if (!file) throw new HttpError(400, 'FILE_REQUIRED', 'Upload a file in the "file" field');
  const type = proofFiles.detectFileType(file.buffer);
  if (!type) throw new HttpError(400, 'INVALID_FILE', 'The file content is not a PDF, JPG or PNG');

  const storedName = await proofFiles.writeProofFile(file.buffer, type.ext);
  try {
    return await prisma.$transaction(async (tx) => {
      // Claim the renewal slot so two uploads at once cannot both succeed
      const claimed = await tx.document.updateMany({
        where: { id: doc.id, status: { not: 'REPLACED' }, renewalValidUntil: null },
        data: { renewalValidUntil: newUntil },
      });
      if (claimed.count !== 1) throw new HttpError(409, 'RENEWAL_PENDING', 'A renewal is already waiting for an officer');
      const proof = await tx.proof.create({
        data: { ownerType: 'DOCUMENT', ownerId: doc.id, filePath: storedName, uploadedBy: user.id },
      });
      const obligation = await tx.obligation.findFirst({ where: { kind: 'DOCUMENT', refId: doc.id } });
      if (doc.application.assignedOfficerId) {
        await notifyService.sendAlert(tx, {
          deliveries: [{ userId: doc.application.assignedOfficerId, channel: 'IN_APP' }],
          subject: `Renewal uploaded for ${doc.application.appCode}`,
          body: `A renewed ${doc.docType} (new expiry ${isoDay(newUntil)}) is waiting for your confirmation.`,
          obligationId: obligation ? obligation.id : null,
        });
      }
      await audit.logAction(
        {
          userId: user.id,
          action: 'DOCUMENT_RENEWAL_UPLOADED',
          entity: 'proof',
          entityId: proof.id,
          after: { documentId: doc.id, appCode: doc.application.appCode, newValidUntil: isoDay(newUntil), fileType: type.ext },
        },
        tx,
      );
      return {
        proof: { id: proof.id, verifiedStatus: proof.verifiedStatus, uploadedOn: proof.uploadedOn },
        document: { id: doc.id, status: doc.status, renewalValidUntil: newUntil },
      };
    });
  } catch (e) {
    await proofFiles.removeProofFile(storedName);
    throw e;
  }
}

// Officer accepts or rejects the pending renewal, ONE transaction.
// ACCEPTED: old document REPLACED + its obligation DONE; a new document and obligation open.
// REJECTED: the old document stays as it was and the institution can upload again.
async function decideRenewal(user, documentId, { status, remarks }) {
  const doc = await findScopedDocument(user, documentId);
  if (!doc) throw new HttpError(404, 'NOT_FOUND', 'Document not found');
  const proof = await prisma.proof.findFirst({
    where: { ownerType: 'DOCUMENT', ownerId: doc.id, verifiedStatus: 'PENDING' },
    orderBy: { id: 'desc' },
  });
  if (!proof || !doc.renewalValidUntil) {
    throw new HttpError(409, 'NO_PENDING_RENEWAL', 'There is no renewal waiting for a decision');
  }
  if (status === 'ACCEPTED' && !doc.application.assignedOfficerId) {
    throw new HttpError(409, 'NO_OFFICER', 'The file has no assigned officer');
  }
  const now = new Date();
  const newUntil = startOfUtcDay(doc.renewalValidUntil);

  return prisma.$transaction(async (tx) => {
    const claimedProof = await tx.proof.updateMany({
      where: { id: proof.id, verifiedStatus: 'PENDING' },
      data: { verifiedStatus: status, remarks: remarks ?? null },
    });
    if (claimedProof.count !== 1) throw new HttpError(409, 'NO_PENDING_RENEWAL', 'This renewal was already decided');

    if (status === 'REJECTED') {
      const claimed = await tx.document.updateMany({
        where: { id: doc.id, renewalValidUntil: { not: null } },
        data: { renewalValidUntil: null },
      });
      if (claimed.count !== 1) throw new HttpError(409, 'NO_PENDING_RENEWAL', 'This renewal was already decided');
      const obligation = await tx.obligation.findFirst({ where: { kind: 'DOCUMENT', refId: doc.id } });
      await notifyService.notifyInstitutionUsers(tx, doc.application.institutionId, {
        subject: `Renewal rejected for ${doc.application.appCode}`,
        body: `Your renewed ${doc.docType} was rejected: ${remarks}. Please upload it again.`,
        obligationId: obligation ? obligation.id : null,
      });
      await audit.logAction(
        {
          userId: user.id,
          action: 'DOCUMENT_RENEWAL_REJECTED',
          entity: 'document',
          entityId: doc.id,
          after: { proofId: proof.id, remarks },
        },
        tx,
      );
      return {
        document: { id: doc.id, status: doc.status, renewalValidUntil: null },
        proof: { id: proof.id, verifiedStatus: 'REJECTED', remarks },
      };
    }

    // ACCEPTED
    const claimed = await tx.document.updateMany({
      where: { id: doc.id, status: { in: ['VALID', 'EXPIRED'] }, renewalValidUntil: { not: null } },
      data: { status: 'REPLACED', closedOn: now, renewalValidUntil: null },
    });
    if (claimed.count !== 1) throw new HttpError(409, 'NO_PENDING_RENEWAL', 'This renewal was already decided');
    const fresh = await tx.document.create({
      data: { applicationId: doc.applicationId, docType: doc.docType, validUntil: newUntil },
    });
    await tx.document.update({ where: { id: doc.id }, data: { replacedById: fresh.id } });
    await tx.obligation.updateMany({
      where: { kind: 'DOCUMENT', refId: doc.id, state: { not: 'DONE' } },
      data: { state: 'DONE', closedOn: now },
    });
    const obligation = await tx.obligation.create({
      data: {
        kind: 'DOCUMENT',
        refId: fresh.id,
        applicationId: doc.applicationId,
        ownerId: doc.application.assignedOfficerId,
        dueDate: newUntil,
      },
    });
    await notifyService.notifyInstitutionUsers(tx, doc.application.institutionId, {
      subject: `Renewal accepted for ${doc.application.appCode}`,
      body: `Your renewed ${doc.docType} was accepted. New expiry: ${isoDay(newUntil)}.`,
      obligationId: obligation.id,
    });
    await audit.logAction(
      {
        userId: user.id,
        action: 'DOCUMENT_RENEWED',
        entity: 'document',
        entityId: doc.id,
        before: { status: doc.status, validUntil: isoDay(doc.validUntil) },
        after: { newDocumentId: fresh.id, newValidUntil: isoDay(newUntil), proofId: proof.id, obligationId: obligation.id },
      },
      tx,
    );
    return {
      document: { id: doc.id, status: 'REPLACED', replacedById: fresh.id, closedOn: now },
      newDocument: { id: fresh.id, docType: fresh.docType, validUntil: newUntil, status: 'VALID', obligationId: obligation.id },
      proof: { id: proof.id, verifiedStatus: 'ACCEPTED', remarks: remarks ?? null },
    };
  });
}

module.exports = { findScopedDocumentProof, createDocument, listDocuments, requestRenewal, decideRenewal };