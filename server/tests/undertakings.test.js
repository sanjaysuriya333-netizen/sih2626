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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sih-proofs-'));
const oldDir = process.env.UPLOAD_DIR;
process.env.UPLOAD_DIR = tmp;
const proofsDir = path.join(tmp, 'proofs');
const storedFiles = () => (fs.existsSync(proofsDir) ? fs.readdirSync(proofsDir) : []);

const DAY = 24 * 60 * 60 * 1000;
const today = startOfUtcDay(new Date());
const iso = (d) => d.toISOString().slice(0, 10);
const todayIso = iso(today);
const future = iso(new Date(today.getTime() + 10 * DAY));
const later = iso(new Date(today.getTime() + 20 * DAY));
const past = iso(new Date(today.getTime() - DAY));

const PDF = Buffer.from('%PDF-1.4\nhello\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('rest')]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

const created = [];
const undertakingIds = [];
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
async function record(agent, appId, body = { description: 'Build the library block', dueDate: future }) {
  const res = await agent.post(`/api/applications/${appId}/undertakings`).send(body);
  if (res.status === 201) undertakingIds.push(res.body.data.id);
  return res;
}
const upload = (agent, id, buf = PDF, filename = 'proof.pdf') =>
  agent.post(`/api/undertakings/${id}/proofs`).attach('file', buf, { filename });
const verify = (agent, id, body) => agent.post(`/api/proofs/${id}/verify`).send(body);
const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
// a file of institution 1 with a submitted proof
async function submitted(file = null) {
  const f = file || (await createApp(officer));
  const und = (await record(officer, f.id)).body.data;
  const up = await upload(inst, und.id);
  expect(up.status).toBe(201);
  return { file: f, und, proofId: up.body.data.proof.id };
}

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
  const obligations = await prisma.obligation.findMany({ where: { applicationId: { in: created } }, select: { id: true } });
  await prisma.notification.deleteMany({ where: { obligationId: { in: obligations.map((o) => o.id) } } });
  const proofs = await prisma.proof.findMany({
    where: { ownerType: 'UNDERTAKING', ownerId: { in: undertakingIds } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({ where: { entity: 'proof', entityId: { in: proofs.map((p) => p.id) } } });
  await prisma.proof.deleteMany({ where: { id: { in: proofs.map((p) => p.id) } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'undertaking', entityId: { in: undertakingIds } } });
  await prisma.obligation.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.undertaking.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.stageHistory.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'application', entityId: { in: created } } });
  await prisma.application.deleteMany({ where: { id: { in: created } } });
  process.env.UPLOAD_DIR = oldDir;
  fs.rmSync(tmp, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe('POST /api/applications/:id/undertakings', () => {
  it('creates the undertaking, its obligation, notifications and an audit row', async () => {
    const file = await createApp(officer);
    const res = await record(officer, file.id);
    expect(res.status).toBe(201);
    const u = res.body.data;
    expect(u.status).toBe('PENDING');

    const ob = await prisma.obligation.findFirst({ where: { kind: 'UNDERTAKING', refId: u.id } });
    expect(ob).toMatchObject({ state: 'OPEN', lastAlertLevel: 0, ownerId: file.assignedOfficerId, applicationId: file.id });
    expect(iso(ob.dueDate)).toBe(future);
    const notes = await prisma.notification.findMany({ where: { obligationId: ob.id } });
    expect(notes.map((n) => n.userId).sort()).toEqual(instUsers.map((x) => x.id).sort());
    expect(notes.every((n) => n.channel === 'IN_APP')).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: 'UNDERTAKING_RECORDED', entityId: u.id } })).toBe(1);
  });

  it('validates input and file status', async () => {
    const file = await createApp(officer);
    expect((await record(officer, file.id, { description: 'ok promise', dueDate: past })).status).toBe(400);
    expect((await record(officer, file.id, { description: '', dueDate: future })).status).toBe(400);
    expect((await record(officer, file.id, { description: 'ok promise', dueDate: '2026-02-30' })).status).toBe(400);
    expect((await record(officer, file.id, { description: 'due today ok', dueDate: todayIso })).status).toBe(201);

    await prisma.application.update({ where: { id: file.id }, data: { status: 'APPROVED' } });
    expect((await record(officer, file.id)).status).toBe(201); // approval can come with undertakings
    await prisma.application.update({ where: { id: file.id }, data: { status: 'REJECTED' } });
    const closed = await record(officer, file.id);
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe('APPLICATION_CLOSED');
  });

  it('blocks institutions (403), anonymous users (401) and out-of-scope staff (404)', async () => {
    const outside = await createApp(head, { assignedOfficerId: outsideOfficer.id });
    expect((await record(inst, outside.id)).status).toBe(403);
    const mine = await createApp(officer);
    expect((await record(inst, mine.id)).status).toBe(403);
    expect((await request(app).post(`/api/applications/${mine.id}/undertakings`).send({})).status).toBe(401);
    expect((await record(officer, outside.id)).status).toBe(404);
    expect((await record(sup, outside.id)).status).toBe(404);
    expect((await record(head, outside.id)).status).toBe(201);
  });

  it('a failure mid-transaction rolls back everything', async () => {
    const file = await createApp(officer);
    const notesBefore = await prisma.notification.count({ where: { userId: instUsers[0].id } });
    const spy = vi.spyOn(audit, 'logAction').mockRejectedValueOnce(new Error('boom'));
    const res = await record(officer, file.id);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await prisma.undertaking.count({ where: { applicationId: file.id } })).toBe(0);
    expect(await prisma.obligation.count({ where: { applicationId: file.id, kind: 'UNDERTAKING' } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: instUsers[0].id } })).toBe(notesBefore);
  });
});

describe('GET /api/undertakings', () => {
  it('limits rows by scope, supports filters and flags late promises', async () => {
    const mine = await createApp(officer);
    const other = await createApp(head, { institutionId: 2, assignedOfficerId: officer1.id });
    const u1 = (await record(officer, mine.id)).body.data;
    const u2 = (await record(head, other.id)).body.data;
    const ids = async (agent, q = '') => (await agent.get(`/api/undertakings?pageSize=100${q}`)).body.data.map((r) => r.id);

    const forInst = await ids(inst);
    expect(forInst).toContain(u1.id);
    expect(forInst).not.toContain(u2.id);
    expect(await ids(officer)).toEqual(expect.arrayContaining([u1.id, u2.id]));
    expect(await ids(head, `&applicationId=${mine.id}`)).toEqual([u1.id]);
    expect(await ids(head, '&status=VERIFIED')).not.toContain(u1.id);

    await prisma.undertaking.update({ where: { id: u1.id }, data: { dueDate: new Date(today.getTime() - DAY) } });
    const row = (await head.get(`/api/undertakings?applicationId=${mine.id}`)).body.data[0];
    expect(row.late).toBe(true);
    expect(row.proofs).toEqual([]);

    expect((await head.get('/api/undertakings?status=NOPE')).status).toBe(400);
    expect((await request(app).get('/api/undertakings')).status).toBe(401);
  });
});

describe('POST /api/undertakings/:id/proofs', () => {
  it('stores a valid PDF under a random name and marks the undertaking SUBMITTED', async () => {
    const file = await createApp(officer);
    const und = (await record(officer, file.id)).body.data;
    const before = storedFiles().length;
    const res = await upload(inst, und.id, PDF, 'My Lease Scan.pdf');
    expect(res.status).toBe(201);
    expect(res.body.data.undertaking.status).toBe('SUBMITTED');

    const proof = await prisma.proof.findUnique({ where: { id: res.body.data.proof.id } });
    expect(proof.verifiedStatus).toBe('PENDING');
    expect(proof.uploadedBy).toBe(instUsers.find((u) => u.email === 'institution1@demo.test').id);
    expect(proof.filePath).toMatch(/^[0-9a-f-]{36}\.pdf$/); // never the user's file name
    expect(storedFiles()).toHaveLength(before + 1);
    expect(fs.existsSync(path.join(proofsDir, proof.filePath))).toBe(true);
    expect((await prisma.undertaking.findUnique({ where: { id: und.id } })).status).toBe('SUBMITTED');
    expect(await prisma.auditLog.count({ where: { action: 'PROOF_UPLOADED', entityId: proof.id } })).toBe(1);

    // a second upload while SUBMITTED is refused
    const again = await upload(inst, und.id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_SUBMITTED');
  });

  it('accepts PNG and JPG, and names the file by its detected type', async () => {
    const f1 = await createApp(officer);
    const u1 = (await record(officer, f1.id)).body.data;
    const r1 = await upload(inst, u1.id, PNG, 'photo.jpg'); // PNG bytes with a .jpg name
    expect(r1.status).toBe(201);
    expect((await prisma.proof.findUnique({ where: { id: r1.body.data.proof.id } })).filePath).toMatch(/\.png$/);

    const f2 = await createApp(officer);
    const u2 = (await record(officer, f2.id)).body.data;
    expect((await upload(inst, u2.id, JPG, 'scan.jpeg')).status).toBe(201);
  });

  it('rejects wrong types, fake extensions, big files and missing files', async () => {
    const file = await createApp(officer);
    const und = (await record(officer, file.id)).body.data;
    const before = storedFiles().length;

    const fake = await upload(inst, und.id, Buffer.from('just some text, not a pdf'), 'fake.pdf');
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe('INVALID_FILE');
    const wrongName = await upload(inst, und.id, PDF, 'notes.txt');
    expect(wrongName.status).toBe(400);
    expect(wrongName.body.error.code).toBe('INVALID_FILE_TYPE');
    expect((await upload(inst, und.id, PDF, 'run.exe')).body.error.code).toBe('INVALID_FILE_TYPE');
    const big = await upload(inst, und.id, Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]), 'big.pdf');
    expect(big.status).toBe(400);
    expect(big.body.error.code).toBe('FILE_TOO_LARGE');
    const none = await inst.post(`/api/undertakings/${und.id}/proofs`);
    expect(none.status).toBe(400);
    expect(none.body.error.code).toBe('FILE_REQUIRED');

    expect(storedFiles()).toHaveLength(before); // nothing was written
    expect((await prisma.undertaking.findUnique({ where: { id: und.id } })).status).toBe('PENDING');
  });

  it('blocks staff (403), anonymous users (401) and other institutions (404)', async () => {
    const other = await createApp(head, { institutionId: 2, assignedOfficerId: officer1.id });
    const und = (await record(head, other.id)).body.data;
    expect((await upload(inst, und.id)).status).toBe(404); // institution 1 cannot touch institution 2
    expect((await upload(officer, und.id)).status).toBe(403);
    const anon = await request(app).post(`/api/undertakings/${und.id}/proofs`).attach('file', PDF, { filename: 'a.pdf' });
    expect(anon.status).toBe(401);
    expect((await upload(inst, 999999)).status).toBe(404);
  });

  it('a failure after the file was written deletes the file and rolls back', async () => {
    const file = await createApp(officer);
    const und = (await record(officer, file.id)).body.data;
    const before = storedFiles();
    const spy = vi.spyOn(audit, 'logAction').mockRejectedValueOnce(new Error('boom'));
    const res = await upload(inst, und.id);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(storedFiles()).toEqual(before);
    expect(await prisma.proof.count({ where: { ownerType: 'UNDERTAKING', ownerId: und.id } })).toBe(0);
    expect((await prisma.undertaking.findUnique({ where: { id: und.id } })).status).toBe('PENDING');
  });
});

describe('GET /api/proofs/:id/file', () => {
  it('streams the file with safe headers to the owner and to staff in scope only', async () => {
    const { proofId } = await submitted();
    const res = await inst.get(`/api/proofs/${proofId}/file`).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(res.body, PDF)).toBe(0);
    expect((await officer.get(`/api/proofs/${proofId}/file`).buffer(true).parse(binary)).status).toBe(200);
    expect((await head.get(`/api/proofs/${proofId}/file`).buffer(true).parse(binary)).status).toBe(200);
    expect((await request(app).get(`/api/proofs/${proofId}/file`)).status).toBe(401);
    expect((await inst.get('/api/proofs/999999/file')).status).toBe(404);
  });

  it('blocks out-of-scope staff (404)', async () => {
    const file = await createApp(head, { assignedOfficerId: outsideOfficer.id }); // institution 1, other team
    const und = (await record(head, file.id)).body.data;
    const up = await upload(inst, und.id);
    expect(up.status).toBe(201);
    const url = `/api/proofs/${up.body.data.proof.id}/file`;
    expect((await officer.get(url)).status).toBe(404);
    expect((await sup.get(url)).status).toBe(404);
    expect((await inst.get(url).buffer(true).parse(binary)).status).toBe(200);
  });
});

describe('POST /api/proofs/:id/verify', () => {
  it('ACCEPT closes the undertaking and its obligation', async () => {
    const { und, proofId } = await submitted();
    const res = await verify(officer, proofId, { status: 'ACCEPTED', remarks: 'Looks good' });
    expect(res.status).toBe(200);

    const proof = await prisma.proof.findUnique({ where: { id: proofId } });
    expect(proof).toMatchObject({ verifiedStatus: 'ACCEPTED', remarks: 'Looks good' });
    const u = await prisma.undertaking.findUnique({ where: { id: und.id } });
    expect(u.status).toBe('VERIFIED');
    expect(u.verifiedBy).toBe(officer1.id);
    expect(u.closedOn).not.toBeNull();
    const ob = await prisma.obligation.findFirst({ where: { kind: 'UNDERTAKING', refId: und.id } });
    expect(ob.state).toBe('DONE');
    expect(ob.closedOn).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: 'PROOF_VERIFIED', entityId: proofId } })).toBe(1);

    expect((await verify(officer, proofId, { status: 'ACCEPTED' })).status).toBe(409); // decided already
    expect((await upload(inst, und.id)).status).toBe(409); // closed promise
  });

  it('REJECT reopens the undertaking and obligation with the new date, then a new proof can close it', async () => {
    const { und, proofId } = await submitted();
    const ob0 = await prisma.obligation.findFirst({ where: { kind: 'UNDERTAKING', refId: und.id } });
    await prisma.obligation.update({ where: { id: ob0.id }, data: { state: 'ESCALATED', lastAlertLevel: 3 } });
    const notesBefore = await prisma.notification.count({ where: { obligationId: ob0.id } });

    // validation
    expect((await verify(officer, proofId, { status: 'REJECTED', newDueDate: later })).status).toBe(400); // no remarks
    expect((await verify(officer, proofId, { status: 'REJECTED', remarks: 'Blurry' })).status).toBe(400); // no date
    expect((await verify(officer, proofId, { status: 'REJECTED', remarks: 'Blurry', newDueDate: past })).status).toBe(400);
    expect((await verify(officer, proofId, { status: 'ACCEPTED', newDueDate: later })).status).toBe(400);
    expect((await verify(officer, proofId, { status: 'MAYBE' })).status).toBe(400);

    const res = await verify(officer, proofId, { status: 'REJECTED', remarks: 'Blurry scan', newDueDate: later });
    expect(res.status).toBe(200);
    expect((await prisma.proof.findUnique({ where: { id: proofId } })).verifiedStatus).toBe('REJECTED');
    const u = await prisma.undertaking.findUnique({ where: { id: und.id } });
    expect(u.status).toBe('PENDING');
    expect(iso(u.dueDate)).toBe(later);
    expect(u.closedOn).toBeNull();
    const ob = await prisma.obligation.findUnique({ where: { id: ob0.id } });
    expect(ob).toMatchObject({ state: 'OPEN', lastAlertLevel: 0, closedOn: null });
    expect(iso(ob.dueDate)).toBe(later);
    expect(await prisma.notification.count({ where: { obligationId: ob0.id } })).toBe(notesBefore + instUsers.length);

    // the institution uploads again, staff accepts
    const up = await upload(inst, und.id, PNG, 'better.png');
    expect(up.status).toBe(201);
    expect((await verify(sup, up.body.data.proof.id, { status: 'ACCEPTED' })).status).toBe(200);
    expect((await prisma.undertaking.findUnique({ where: { id: und.id } })).status).toBe('VERIFIED');
    expect(await prisma.proof.count({ where: { ownerType: 'UNDERTAKING', ownerId: und.id } })).toBe(2); // history kept
  });

  it('a failure while accepting rolls everything back', async () => {
    const { und, proofId } = await submitted();
    const spy = vi.spyOn(audit, 'logAction').mockRejectedValueOnce(new Error('boom'));
    const res = await verify(officer, proofId, { status: 'ACCEPTED' });
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect((await prisma.proof.findUnique({ where: { id: proofId } })).verifiedStatus).toBe('PENDING');
    expect((await prisma.undertaking.findUnique({ where: { id: und.id } })).status).toBe('SUBMITTED');
    const ob = await prisma.obligation.findFirst({ where: { kind: 'UNDERTAKING', refId: und.id } });
    expect(ob.state).not.toBe('DONE');
  });

  it('a failure while rejecting rolls everything back', async () => {
    const { und, proofId } = await submitted();
    const spy = vi.spyOn(notifyService, 'notifyInstitutionUsers').mockRejectedValueOnce(new Error('boom'));
    const res = await verify(officer, proofId, { status: 'REJECTED', remarks: 'No', newDueDate: later });
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect((await prisma.proof.findUnique({ where: { id: proofId } })).verifiedStatus).toBe('PENDING');
    const u = await prisma.undertaking.findUnique({ where: { id: und.id } });
    expect(u.status).toBe('SUBMITTED');
    expect(iso(u.dueDate)).toBe(future);
    const ob = await prisma.obligation.findFirst({ where: { kind: 'UNDERTAKING', refId: und.id } });
    expect(iso(ob.dueDate)).toBe(future);
  });
});