import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'node:module';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';

const require = createRequire(import.meta.url);
const app = require('../src/app.js');
const prisma = require('../src/utils/prisma.js');
const audit = require('../src/services/audit.js');
const notifyService = require('../src/services/notifyService.js');
const { startOfUtcDay } = require('../src/services/workingDays.js');

// Uploaded test files go to a temp folder, never to the real uploads/ folder
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sih-docs-'));
const oldDir = process.env.UPLOAD_DIR;
process.env.UPLOAD_DIR = tmp;
const proofsDir = path.join(tmp, 'proofs');
const storedFiles = () => (fs.existsSync(proofsDir) ? fs.readdirSync(proofsDir) : []);

const DAY = 24 * 60 * 60 * 1000;
const today = startOfUtcDay(new Date());
const iso = (d) => d.toISOString().slice(0, 10);
const plus = (n) => iso(new Date(today.getTime() + n * DAY));
const todayIso = iso(today);

const PDF = Buffer.from('%PDF-1.4\nhello\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('rest')]);

const created = [];
let officer, sup, head, inst, officer1, outsideOfficer, instUsers;

async function agentFor(email) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: 'Demo@1234' });
  return agent;
}
async function createApp(agent, over = {}) {
  const res = await agent
    .post('/api/applications')
    .send({ institutionId: 1, newOrExisting: 'NEW', programmeLevel: 'UG', submittedOn: todayIso, ...over });
  expect(res.status).toBe(201);
  created.push(res.body.data.id);
  return res.body.data;
}
const addDoc = (agent, body) => agent.post('/api/documents').send(body);
async function newDoc(agent, file, over = {}) {
  const res = await addDoc(agent, { applicationId: file.id, docType: 'Lease deed', validUntil: plus(10), ...over });
  expect(res.status).toBe(201);
  return res.body.data;
}
const renew = (agent, id, { newValidUntil, file = PDF, name = 'renewal.pdf' } = {}) => {
  let r = agent.post(`/api/documents/${id}/renew`);
  if (newValidUntil) r = r.field('newValidUntil', newValidUntil);
  return file ? r.attach('file', file, { filename: name }) : r;
};
const decide = (agent, id, body) => agent.post(`/api/documents/${id}/renewal-decision`).send(body);
const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

beforeAll(async () => {
  [officer, sup, head, inst] = await Promise.all([
    agentFor('officer1@demo.test'),
    agentFor('supervisor1@demo.test'),
    agentFor('head1@demo.test'),
    agentFor('institution1@demo.test'),
  ]);
  officer1 = await prisma.user.findUnique({ where: { email: 'officer1@demo.test' } });
  const sup1 = await prisma.user.findUnique({ where: { email: 'supervisor1@demo.test' } });
  outsideOfficer = await prisma.user.findFirst({ where: { role: 'OFFICER', supervisorId: { not: sup1.id } } });
  instUsers = await prisma.user.findMany({ where: { role: 'INSTITUTION', institutionId: 1, active: true } });
});

afterAll(async () => {
  // test cleanup only: the app itself never deletes rows
  const docs = await prisma.document.findMany({ where: { applicationId: { in: created } }, select: { id: true } });
  const docIds = docs.map((d) => d.id);
  const obs = await prisma.obligation.findMany({ where: { applicationId: { in: created } }, select: { id: true } });
  const obIds = obs.map((o) => o.id);
  const proofs = await prisma.proof.findMany({
    where: { ownerType: 'DOCUMENT', ownerId: { in: docIds } },
    select: { id: true },
  });
  const proofIds = proofs.map((p) => p.id);
  await prisma.notification.deleteMany({ where: { obligationId: { in: obIds } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'proof', entityId: { in: proofIds } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'document', entityId: { in: docIds } } });
  await prisma.proof.deleteMany({ where: { id: { in: proofIds } } });
  await prisma.obligation.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.document.updateMany({ where: { id: { in: docIds } }, data: { replacedById: null } });
  await prisma.document.deleteMany({ where: { id: { in: docIds } } });
  await prisma.stageHistory.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'application', entityId: { in: created } } });
  await prisma.application.deleteMany({ where: { id: { in: created } } });
  process.env.UPLOAD_DIR = oldDir;
  fs.rmSync(tmp, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe('POST /api/documents', () => {
  it('creates the document and its DOCUMENT obligation, and audits', async () => {
    const file = await createApp(officer);
    const res = await addDoc(officer, { applicationId: file.id, docType: 'Lease deed', validUntil: plus(100) });
    expect(res.status).toBe(201);
    const doc = res.body.data;
    expect(doc.status).toBe('VALID');

    const ob = await prisma.obligation.findFirst({ where: { kind: 'DOCUMENT', refId: doc.id } });
    expect(ob).toMatchObject({ state: 'OPEN', lastAlertLevel: 0, ownerId: file.assignedOfficerId, applicationId: file.id });
    expect(iso(ob.dueDate)).toBe(plus(100));
    expect(await prisma.auditLog.count({ where: { action: 'DOCUMENT_CREATED', entityId: doc.id } })).toBe(1);

    const dup = await addDoc(officer, { applicationId: file.id, docType: 'lease DEED', validUntil: plus(200) });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('ALREADY_EXISTS');

    // the institution may add a document to its own file
    const own = await addDoc(inst, { applicationId: file.id, docType: 'Fire certificate', validUntil: plus(50) });
    expect(own.status).toBe(201);
  });

  it('validates the input', async () => {
    const file = await createApp(officer);
    const ok = { applicationId: file.id, docType: 'Lease deed', validUntil: plus(30) };
    expect((await addDoc(officer, { ...ok, validUntil: plus(-3) })).status).toBe(400);
    expect((await addDoc(officer, { ...ok, validUntil: '2026-02-30' })).status).toBe(400);
    expect((await addDoc(officer, { ...ok, docType: 'x' })).status).toBe(400);
    expect((await addDoc(officer, { docType: 'Lease deed', validUntil: plus(30) })).status).toBe(400);
    expect(await prisma.document.count({ where: { applicationId: file.id } })).toBe(0);
  });

  it('respects the data scope (404) and login (401)', async () => {
    const outside = await createApp(head, { assignedOfficerId: outsideOfficer.id });
    const other = await createApp(head, { institutionId: 2, assignedOfficerId: officer1.id });
    const body = (f) => ({ applicationId: f.id, docType: 'Lease deed', validUntil: plus(30) });
    expect((await addDoc(officer, body(outside))).status).toBe(404);
    expect((await addDoc(sup, body(outside))).status).toBe(404);
    expect((await addDoc(inst, body(other))).status).toBe(404); // other institution's file
    expect((await addDoc(head, body(outside))).status).toBe(201);
    expect((await request(app).post('/api/documents').send(body(outside))).status).toBe(401);
  });

  it('a failure mid-transaction rolls back the document and the obligation', async () => {
    const file = await createApp(officer);
    const spy = vi.spyOn(audit, 'logAction').mockRejectedValueOnce(new Error('boom'));
    const res = await addDoc(officer, { applicationId: file.id, docType: 'Lease deed', validUntil: plus(30) });
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await prisma.document.count({ where: { applicationId: file.id } })).toBe(0);
    expect(await prisma.obligation.count({ where: { applicationId: file.id, kind: 'DOCUMENT' } })).toBe(0);
  });
});

describe('GET /api/documents', () => {
  it('filters, computes daysToExpiry and respects scope', async () => {
    const file = await createApp(officer);
    const soon = await newDoc(officer, file, { docType: 'Lease deed', validUntil: plus(10) });
    const later = await newDoc(officer, file, { docType: 'Fire certificate', validUntil: plus(100) });
    const other = await createApp(head, { institutionId: 2, assignedOfficerId: officer1.id });
    const hidden = await newDoc(head, other, { docType: 'Lease deed', validUntil: plus(10) });
    const ids = async (agent, q) => (await agent.get(`/api/documents?pageSize=200${q}`)).body.data.map((r) => r.id);

    expect(await ids(inst, `&applicationId=${file.id}`)).toEqual([soon.id, later.id]); // sorted by expiry
    expect(await ids(inst, '')).not.toContain(hidden.id);
    expect(await ids(officer, '')).toContain(hidden.id);
    expect(await ids(head, `&applicationId=${file.id}&expiringWithinDays=30`)).toEqual([soon.id]);
    expect(await ids(head, `&applicationId=${file.id}&status=REPLACED`)).toEqual([]);

    const row = (await head.get(`/api/documents?applicationId=${file.id}`)).body.data.find((r) => r.id === later.id);
    expect(row.daysToExpiry).toBeGreaterThanOrEqual(99);
    expect(row.daysToExpiry).toBeLessThanOrEqual(101);
    expect(row.obligationState).toBe('OPEN');
    expect(row.appCode).toBeTruthy();
    expect(row.renewal).toBeNull();

    expect((await head.get('/api/documents?status=NOPE')).status).toBe(400);
    expect((await request(app).get('/api/documents')).status).toBe(401);
  });
});

describe('renewal: upload', () => {
  it('stores the file, records the requested expiry and tells the officer', async () => {
    const file = await createApp(officer);
    const doc = await newDoc(officer, file);
    const before = storedFiles().length;
    const res = await renew(inst, doc.id, { newValidUntil: plus(400) });
    expect(res.status).toBe(201);

    const proof = await prisma.proof.findUnique({ where: { id: res.body.data.proof.id } });
    expect(proof).toMatchObject({ ownerType: 'DOCUMENT', ownerId: doc.id, verifiedStatus: 'PENDING' });
    expect(proof.filePath).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(storedFiles()).toHaveLength(before + 1);
    expect(iso((await prisma.document.findUnique({ where: { id: doc.id } })).renewalValidUntil)).toBe(plus(400));
    const note = await prisma.notification.findFirst({
      where: { obligationId: doc.obligationId, userId: officer1.id },
    });
    expect(note.channel).toBe('IN_APP');
    expect(await prisma.auditLog.count({ where: { action: 'DOCUMENT_RENEWAL_UPLOADED', entityId: proof.id } })).toBe(1);

    const row = (await officer.get(`/api/documents?applicationId=${file.id}`)).body.data[0];
    expect(row.renewal).toMatchObject({ proofId: proof.id });
    expect(iso(new Date(row.renewal.newValidUntil))).toBe(plus(400));

    const again = await renew(inst, doc.id, { newValidUntil: plus(500) });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('RENEWAL_PENDING');
  });

  it('rejects bad input and writes nothing', async () => {
    const file = await createApp(officer);
    const doc = await newDoc(officer, file);
    const before = storedFiles().length;
    expect((await renew(inst, doc.id, { newValidUntil: plus(5) })).status).toBe(400); // earlier than current expiry
    expect((await renew(inst, doc.id, {})).status).toBe(400); // no date
    const fake = await renew(inst, doc.id, { newValidUntil: plus(400), file: Buffer.from('text only'), name: 'fake.pdf' });
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe('INVALID_FILE');
    expect((await renew(inst, doc.id, { newValidUntil: plus(400), name: 'notes.txt' })).body.error.code).toBe('INVALID_FILE_TYPE');
    const none = await renew(inst, doc.id, { newValidUntil: plus(400), file: null });
    expect(none.body.error.code).toBe('FILE_REQUIRED');
    expect(storedFiles()).toHaveLength(before);
    expect((await prisma.document.findUnique({ where: { id: doc.id } })).renewalValidUntil).toBeNull();
  });

  it('an expired document can be renewed', async () => {
    const file = await createApp(officer);
    const doc = await newDoc(officer, file);
    await prisma.document.update({ where: { id: doc.id }, data: { status: 'EXPIRED', validUntil: new Date(today.getTime() - 5 * DAY) } });
    expect((await renew(inst, doc.id, { newValidUntil: plus(200) })).status).toBe(201);
  });

  it('blocks staff (403), anonymous users (401) and other institutions (404)', async () => {
    const other = await createApp(head, { institutionId: 2, assignedOfficerId: officer1.id });
    const doc = await newDoc(head, other);
    expect((await renew(inst, doc.id, { newValidUntil: plus(400) })).status).toBe(404);
    expect((await renew(officer, doc.id, { newValidUntil: plus(400) })).status).toBe(403);
    const anon = await request(app)
      .post(`/api/documents/${doc.id}/renew`)
      .field('newValidUntil', plus(400))
      .attach('file', PDF, { filename: 'a.pdf' });
    expect(anon.status).toBe(401);
  });

  it('a failure after the file was written deletes the file and rolls back', async () => {
    const file = await createApp(officer);
    const doc = await newDoc(officer, file);
    const before = storedFiles();
    const spy = vi.spyOn(notifyService, 'sendAlert').mockRejectedValueOnce(new Error('boom'));
    const res = await renew(inst, doc.id, { newValidUntil: plus(400) });
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(storedFiles()).toEqual(before);
    expect(await prisma.proof.count({ where: { ownerType: 'DOCUMENT', ownerId: doc.id } })).toBe(0);
    expect((await prisma.document.findUnique({ where: { id: doc.id } })).renewalValidUntil).toBeNull();
  });
});

describe('renewal file download', () => {
  it('serves the renewal file by scope', async () => {
    const file = await createApp(head, { assignedOfficerId: outsideOfficer.id }); // institution 1, other team
    const doc = await newDoc(head, file);
    const up = await renew(inst, doc.id, { newValidUntil: plus(400), file: PNG, name: 'new.png' });
    expect(up.status).toBe(201);
    const url = `/api/proofs/${up.body.data.proof.id}/file`;
    const res = await inst.get(url).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(Buffer.compare(res.body, PNG)).toBe(0);
    expect((await head.get(url).buffer(true).parse(binary)).status).toBe(200);
    expect((await officer.get(url)).status).toBe(404);
    expect((await sup.get(url)).status).toBe(404);
  });
});

describe('renewal: decision', () => {
  it('ACCEPT closes the old document and opens a new one with a new obligation', async () => {
    const file = await createApp(officer);
    const doc = await newDoc(officer, file);
    const up = await renew(inst, doc.id, { newValidUntil: plus(400) });
    expect(up.status).toBe(201);

    const res = await decide(officer, doc.id, { status: 'ACCEPTED', remarks: 'Checked' });
    expect(res.status).toBe(200);
    const fresh = res.body.data.newDocument;

    const old = await prisma.document.findUnique({ where: { id: doc.id } });
    expect(old).toMatchObject({ status: 'REPLACED', replacedById: fresh.id, renewalValidUntil: null });
    expect(old.closedOn).not.toBeNull();
    const neu = await prisma.document.findUnique({ where: { id: fresh.id } });
    expect(neu).toMatchObject({ status: 'VALID', docType: 'Lease deed', applicationId: file.id });
    expect(iso(neu.validUntil)).toBe(plus(400));

    const oldOb = await prisma.obligation.findUnique({ where: { id: doc.obligationId } });
    expect(oldOb.state).toBe('DONE');
    expect(oldOb.closedOn).not.toBeNull();
    const newOb = await prisma.obligation.findUnique({ where: { id: fresh.obligationId } });
    expect(newOb).toMatchObject({ kind: 'DOCUMENT', refId: fresh.id, state: 'OPEN', lastAlertLevel: 0, ownerId: file.assignedOfficerId });
    expect(iso(newOb.dueDate)).toBe(plus(400));

    expect((await prisma.proof.findUnique({ where: { id: up.body.data.proof.id } })).verifiedStatus).toBe('ACCEPTED');
    const notes = await prisma.notification.findMany({ where: { obligationId: newOb.id } });
    expect(notes.map((n) => n.userId).sort()).toEqual(instUsers.map((u) => u.id).sort());
    expect(await prisma.auditLog.count({ where: { action: 'DOCUMENT_RENEWED', entityId: doc.id } })).toBe(1);

    expect((await decide(officer, doc.id, { status: 'ACCEPTED' })).status).toBe(409); // nothing pending
    expect((await renew(inst, doc.id, { newValidUntil: plus(500) })).body.error.code).toBe('ALREADY_REPLACED');
    const replaced = (await head.get(`/api/documents?applicationId=${file.id}&status=REPLACED`)).body.data;
    expect(replaced.map((r) => r.id)).toEqual([doc.id]);
  });

  it('REJECT needs remarks, keeps the old document open and lets the institution upload again', async () => {
    const file = await createApp(officer);
    const doc = await newDoc(officer, file);
    const first = await renew(inst, doc.id, { newValidUntil: plus(400) });
    expect((await decide(officer, doc.id, { status: 'REJECTED' })).status).toBe(400); // no remarks
    expect((await decide(officer, doc.id, { status: 'MAYBE' })).status).toBe(400);

    const res = await decide(officer, doc.id, { status: 'REJECTED', remarks: 'Unreadable scan' });
    expect(res.status).toBe(200);
    expect((await prisma.proof.findUnique({ where: { id: first.body.data.proof.id } })).verifiedStatus).toBe('REJECTED');
    const old = await prisma.document.findUnique({ where: { id: doc.id } });
    expect(old).toMatchObject({ status: 'VALID', renewalValidUntil: null, replacedById: null });
    expect((await prisma.obligation.findUnique({ where: { id: doc.obligationId } })).state).toBe('OPEN');
    const notes = await prisma.notification.findMany({ where: { obligationId: doc.obligationId, subject: { startsWith: 'Renewal rejected' } } });
    expect(notes).toHaveLength(instUsers.length);

    const second = await renew(inst, doc.id, { newValidUntil: plus(420), file: PNG, name: 'better.png' });
    expect(second.status).toBe(201);
    expect((await decide(sup, doc.id, { status: 'ACCEPTED' })).status).toBe(200);
    expect(await prisma.proof.count({ where: { ownerType: 'DOCUMENT', ownerId: doc.id } })).toBe(2); // history kept
  });

  it('blocks institutions (403), anonymous users (401) and out-of-scope staff (404)', async () => {
    const file = await createApp(head, { assignedOfficerId: outsideOfficer.id });
    const doc = await newDoc(head, file);
    expect((await renew(inst, doc.id, { newValidUntil: plus(400) })).status).toBe(201);
    expect((await decide(inst, doc.id, { status: 'ACCEPTED' })).status).toBe(403);
    expect((await request(app).post(`/api/documents/${doc.id}/renewal-decision`).send({ status: 'ACCEPTED' })).status).toBe(401);
    expect((await decide(officer, doc.id, { status: 'ACCEPTED' })).status).toBe(404);
    expect((await decide(sup, doc.id, { status: 'ACCEPTED' })).status).toBe(404);
    expect((await decide(head, doc.id, { status: 'ACCEPTED' })).status).toBe(200);
  });

  it('a failure while accepting rolls everything back', async () => {
    const file = await createApp(officer);
    const doc = await newDoc(officer, file);
    const up = await renew(inst, doc.id, { newValidUntil: plus(400) });
    const spy = vi.spyOn(notifyService, 'notifyInstitutionUsers').mockRejectedValueOnce(new Error('boom'));
    const res = await decide(officer, doc.id, { status: 'ACCEPTED' });
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect((await prisma.proof.findUnique({ where: { id: up.body.data.proof.id } })).verifiedStatus).toBe('PENDING');
    const old = await prisma.document.findUnique({ where: { id: doc.id } });
    expect(old.status).toBe('VALID');
    expect(iso(old.renewalValidUntil)).toBe(plus(400));
    expect(await prisma.document.count({ where: { applicationId: file.id } })).toBe(1);
    expect((await prisma.obligation.findUnique({ where: { id: doc.obligationId } })).state).toBe('OPEN');
  });
});


