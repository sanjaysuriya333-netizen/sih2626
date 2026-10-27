const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const audit = require('./audit'); // called as audit.logAction so tests can spy on it
const notifyService = require('./notifyService'); // same reason
const proofFiles = require('./proofFiles');
const documentService = require('./documentService');
const { scopeApplications } = require('./scope');
const { startOfUtcDay } = require('./workingDays');
const { proofFilePath } = require('../utils/uploadDir');

const isoDay = (d) => d.toISOString().slice(0, 10);

// An undertaking, only if its application is inside the caller's data scope
function findScopedUndertaking(user, id) {
  return prisma.undertaking.findFirst({
    where: { AND: [{ id }, { application: { is: scopeApplications(user) } }] },
    include: { application: { select: { id: true, appCode: true, institutionId: true } } },
  });
}

// A proof of kind UNDERTAKING plus its (scoped) undertaking, or null
async function findScopedProof(user, proofId) {
  const proof = await prisma.proof.findUnique({ where: { id: proofId } });
  if (!proof || proof.ownerType !== 'UNDERTAKING') return null;
  const undertaking = await findScopedUndertaking(user, proof.ownerId);
  return undertaking ? { proof, undertaking } : null;
}

// Staff records a promise: undertaking + UNDERTAKING obligation + notifications + audit, ONE transaction
async function recordUndertaking(user, applicationId, { description, dueDate }) {
  const application = await prisma.application.findFirst({
    where: { AND: [{ id: applicationId }, scopeApplications(user)] },
  });
  if (!application) throw new HttpError(404, 'NOT_FOUND', 'Application not found');
  // IN_PROGRESS, or APPROVED (an approval can come with undertakings)
  if (!['IN_PROGRESS', 'APPROVED'].includes(application.status)) {
    throw new HttpError(409, 'APPLICATION_CLOSED', 'Undertakings cannot be added to this file');
  }
  if (!application.assignedOfficerId) throw new HttpError(409, 'NO_OFFICER', 'The file has no assigned officer');
  const due = startOfUtcDay(dueDate);
  if (due < startOfUtcDay(new Date())) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'dueDate cannot be in the past');
  }

  return prisma.$transaction(async (tx) => {
    const undertaking = await tx.undertaking.create({ data: { applicationId, description, dueDate: due } });
    // Same shape as a STAGE obligation: OPEN, alert level 0, owned by the assigned officer
    const obligation = await tx.obligation.create({
      data: {
        kind: 'UNDERTAKING',
        refId: undertaking.id,
        applicationId,
        ownerId: application.assignedOfficerId,
        dueDate: due,
      },
    });
    await notifyService.notifyInstitutionUsers(tx, application.institutionId, {
      subject: `New undertaking for ${application.appCode}`,
      body: `Please submit proof by ${isoDay(due)}: ${description}`,
      obligationId: obligation.id,
    });
    await audit.logAction(
      {
        userId: user.id,
        action: 'UNDERTAKING_RECORDED',
        entity: 'undertaking',
        entityId: undertaking.id,
        after: { applicationId, appCode: application.appCode, dueDate: isoDay(due), obligationId: obligation.id },
      },
      tx,
    );
    return {
      id: undertaking.id,
      applicationId,
      description,
      dueDate: due,
      status: undertaking.status,
      obligationId: obligation.id,
    };
  });
}

// Undertakings with their proofs (proof file names are never exposed)
async function listUndertakings(user, { status, applicationId, page, pageSize }) {
  const filters = {};
  if (status) filters.status = status;
  if (applicationId) filters.applicationId = applicationId;
  const where = { AND: [{ application: { is: scopeApplications(user) } }, filters] };

  const [total, rows] = await Promise.all([
    prisma.undertaking.count({ where }),
    prisma.undertaking.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { application: { select: { appCode: true, institution: { select: { name: true } } } } },
    }),
  ]);
  const proofs = rows.length
    ? await prisma.proof.findMany({
        where: { ownerType: 'UNDERTAKING', ownerId: { in: rows.map((r) => r.id) } },
        orderBy: { id: 'asc' },
      })
    : [];
  const today = startOfUtcDay(new Date());
  const data = rows.map((u) => ({
    id: u.id,
    applicationId: u.applicationId,
    appCode: u.application.appCode,
    institutionName: u.application.institution.name,
    description: u.description,
    dueDate: u.dueDate,
    status: u.status,
    late: ['PENDING', 'SUBMITTED'].includes(u.status) && u.dueDate < today,
    verifiedBy: u.verifiedBy,
    closedOn: u.closedOn,
    proofs: proofs
      .filter((p) => p.ownerId === u.id)
      .map((p) => ({ id: p.id, uploadedOn: p.uploadedOn, verifiedStatus: p.verifiedStatus, remarks: p.remarks })),
  }));
  return { data, total };
}

// Institution uploads proof. The file is written first, then the database change runs in
// ONE transaction; if that fails, the file is deleted again.
async function uploadProof(user, undertakingId, file) {
  const undertaking = await findScopedUndertaking(user, undertakingId);
  if (!undertaking) throw new HttpError(404, 'NOT_FOUND', 'Undertaking not found');
  if (undertaking.status === 'SUBMITTED') {
    throw new HttpError(409, 'ALREADY_SUBMITTED', 'A proof is already waiting for verification');
  }
  if (undertaking.status !== 'PENDING') {
    throw new HttpError(409, 'NOT_OPEN', 'This undertaking is not open for uploads');
  }
  if (!file) throw new HttpError(400, 'FILE_REQUIRED', 'Upload a file in the "file" field');
  const type = proofFiles.detectFileType(file.buffer);
  if (!type) throw new HttpError(400, 'INVALID_FILE', 'The file content is not a PDF, JPG or PNG');

  const storedName = await proofFiles.writeProofFile(file.buffer, type.ext);
  try {
    return await prisma.$transaction(async (tx) => {
      // Claim the undertaking so two uploads at once cannot both succeed
      const claimed = await tx.undertaking.updateMany({
        where: { id: undertaking.id, status: 'PENDING' },
        data: { status: 'SUBMITTED' },
      });
      if (claimed.count !== 1) throw new HttpError(409, 'ALREADY_SUBMITTED', 'A proof is already waiting for verification');
      const proof = await tx.proof.create({
        data: { ownerType: 'UNDERTAKING', ownerId: undertaking.id, filePath: storedName, uploadedBy: user.id },
      });
      await audit.logAction(
        {
          userId: user.id,
          action: 'PROOF_UPLOADED',
          entity: 'proof',
          entityId: proof.id,
          after: { undertakingId: undertaking.id, appCode: undertaking.application.appCode, fileType: type.ext },
        },
        tx,
      );
      return {
        proof: { id: proof.id, verifiedStatus: proof.verifiedStatus, uploadedOn: proof.uploadedOn },
        undertaking: { id: undertaking.id, status: 'SUBMITTED' },
      };
    });
  } catch (e) {
    await proofFiles.removeProofFile(storedName);
    throw e;
  }
}

// Scope check, then the absolute path and type of the stored file
async function getProofFile(user, proofId) {
  // undertaking proofs first, then document-renewal proofs (both scope-checked)
  const found =
    (await findScopedProof(user, proofId)) || (await documentService.findScopedDocumentProof(user, proofId));
  if (!found) throw new HttpError(404, 'NOT_FOUND', 'Proof not found');
  const type = proofFiles.typeForStoredName(found.proof.filePath);
  if (!type) throw new HttpError(404, 'NOT_FOUND', 'Proof not found');
  return { absPath: proofFilePath(found.proof.filePath), mime: type.mime, ext: type.ext };
}

// Staff accepts or rejects. ACCEPTED closes everything; REJECTED reopens the undertaking
// and its obligation with a new due date. ONE transaction.
async function verifyProof(user, proofId, { status, remarks, newDueDate }) {
  const found = await findScopedProof(user, proofId);
  if (!found) throw new HttpError(404, 'NOT_FOUND', 'Proof not found');
  const { proof, undertaking } = found;
  if (proof.verifiedStatus !== 'PENDING') {
    throw new HttpError(409, 'ALREADY_DECIDED', 'This proof was already verified');
  }
  if (undertaking.status !== 'SUBMITTED') {
    throw new HttpError(409, 'NOT_SUBMITTED', 'The undertaking is not waiting for verification');
  }
  const now = new Date();
  const newDue = status === 'REJECTED' ? startOfUtcDay(newDueDate) : null;
  if (newDue && newDue < startOfUtcDay(now)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'newDueDate cannot be in the past');
  }

  return prisma.$transaction(async (tx) => {
    const claimedProof = await tx.proof.updateMany({
      where: { id: proof.id, verifiedStatus: 'PENDING' },
      data: { verifiedStatus: status, remarks: remarks ?? null },
    });
    if (claimedProof.count !== 1) throw new HttpError(409, 'ALREADY_DECIDED', 'This proof was already verified');

    const obligation = await tx.obligation.findFirst({ where: { kind: 'UNDERTAKING', refId: undertaking.id } });
    let undertakingAfter;
    if (status === 'ACCEPTED') {
      const claimed = await tx.undertaking.updateMany({
        where: { id: undertaking.id, status: 'SUBMITTED' },
        data: { status: 'VERIFIED', verifiedBy: user.id, closedOn: now },
      });
      if (claimed.count !== 1) throw new HttpError(409, 'NOT_SUBMITTED', 'The undertaking changed, try again');
      await tx.obligation.updateMany({
        where: { kind: 'UNDERTAKING', refId: undertaking.id, state: { not: 'DONE' } },
        data: { state: 'DONE', closedOn: now },
      });
      undertakingAfter = { id: undertaking.id, status: 'VERIFIED', dueDate: undertaking.dueDate, closedOn: now };
    } else {
      const claimed = await tx.undertaking.updateMany({
        where: { id: undertaking.id, status: 'SUBMITTED' },
        data: { status: 'PENDING', dueDate: newDue, verifiedBy: null, closedOn: null },
      });
      if (claimed.count !== 1) throw new HttpError(409, 'NOT_SUBMITTED', 'The undertaking changed, try again');
      // Reopen: back to OPEN with the new date and a fresh alert ladder
      await tx.obligation.updateMany({
        where: { kind: 'UNDERTAKING', refId: undertaking.id },
        data: { state: 'OPEN', dueDate: newDue, lastAlertLevel: 0, closedOn: null },
      });
      await notifyService.notifyInstitutionUsers(tx, undertaking.application.institutionId, {
        subject: `Proof rejected for ${undertaking.application.appCode}`,
        body: `Your proof was rejected: ${remarks}. New due date: ${isoDay(newDue)}.`,
        obligationId: obligation ? obligation.id : null,
      });
      undertakingAfter = { id: undertaking.id, status: 'PENDING', dueDate: newDue, closedOn: null };
    }

    await audit.logAction(
      {
        userId: user.id,
        action: 'PROOF_VERIFIED',
        entity: 'proof',
        entityId: proof.id,
        before: { verifiedStatus: 'PENDING', undertakingStatus: 'SUBMITTED' },
        after: {
          undertakingId: undertaking.id,
          verifiedStatus: status,
          undertakingStatus: undertakingAfter.status,
          remarks: remarks ?? null,
          newDueDate: newDue ? isoDay(newDue) : null,
        },
      },
      tx,
    );
    return { proof: { id: proof.id, verifiedStatus: status, remarks: remarks ?? null }, undertaking: undertakingAfter };
  });
}

module.exports = { recordUndertaking, listUndertakings, uploadProof, getProofFile, verifyProof };