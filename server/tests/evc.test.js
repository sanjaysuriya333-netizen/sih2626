import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'node:module';
import request from 'supertest';

const require = createRequire(import.meta.url);
const app = require('../src/app.js');
const prisma = require('../src/utils/prisma.js');
const scheduleService = require('../src/services/scheduleService.js');
const { displayStatus } = require('../src/services/evcService.js');
const { loadRulesContext } = require('../src/services/rulesData.js');
const { addWorkingDays, startOfUtcDay } = require('../src/services/workingDays.js');

const DAY = 24 * 60 * 60 * 1000;
const created = [];
const today = startOfUtcDay(new Date());
const iso = (d) => d.toISOString().slice(0, 10);
const todayIso = iso(today);

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
// NEW + UG = Scrutiny + EVC: two stage completions reach "EVC scheduling"
async function fileAtEvcEntry(agent, over = {}) {
  const file = await createApp(agent, over);
  for (let i = 0; i < 2; i++) {
    const r = await agent.post(`/api/applications/${file.id}/stages/complete`).send({});
    expect(r.status).toBe(200);
  }
  return file;
}
const schedule = (agent, id, plannedDate) => agent.post(`/api/evc/${id}/schedule`).send({ plannedDate });
const finish = (agent, visitId, body = { committeeNotes: 'Visit done' }) =>
  agent.post(`/api/evc/${visitId}/complete`).send(body);

let ctx, minDate, validIso, outsideOfficer;

beforeAll(async () => {
  ctx = await loadRulesContext(prisma);
  minDate = addWorkingDays(today, 7, ctx.holidays); // the seeded rule: 7 working days
  validIso = iso(minDate); // exactly the boundary: must be accepted
  const sup1 = await prisma.user.findUnique({ where: { email: 'supervisor1@demo.test' } });
  outsideOfficer = await prisma.user.findFirst({ where: { role: 'OFFICER', supervisorId: { not: sup1.id } } });
});

afterAll(async () => {
  // test cleanup only: the app itself never deletes rows
  await prisma.obligation.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.evcVisit.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.stageHistory.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'application', entityId: { in: created } } });
  await prisma.application.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe('displayStatus', () => {
  const v = (status, offsetDays) => ({ status, plannedDate: new Date(today.getTime() + offsetDays * DAY) });
  it('maps visits to colours', () => {
    expect(displayStatus(v('COMPLETED', -5), today)).toBe('DONE');
    expect(displayStatus(v('PLANNED', -1), today)).toBe('LATE');
    expect(displayStatus(v('PLANNED', 0), today)).toBe('DUE_SOON');
    expect(displayStatus(v('PLANNED', 7), today)).toBe('DUE_SOON');
    expect(displayStatus(v('PLANNED', 8), today)).toBe('PLANNED');
    expect(displayStatus(v('CANCELLED', 3), today)).toBe('CANCELLED');
  });
});

describe('GET /api/evc/queue', () => {
  it('lists EVC-ready files by scope; earlier-stage files are not listed', async () => {
    const officer = await agentFor('officer1@demo.test');
    const sup = await agentFor('supervisor1@demo.test');
    const head = await agentFor('head1@demo.test');
    const inst = await agentFor('institution1@demo.test');

    const ready = await fileAtEvcEntry(officer);
    const early = await createApp(officer); // still at "Application received"
    const outside = await fileAtEvcEntry(head, { assignedOfficerId: outsideOfficer.id });

    const ids = async (agent) => (await agent.get('/api/evc/queue?pageSize=100')).body.data.map((r) => r.id);
    const o = await ids(officer);
    expect(o).toContain(ready.id);
    expect(o).not.toContain(early.id);
    expect(o).not.toContain(outside.id);
    const s = await ids(sup);
    expect(s).toContain(ready.id);
    expect(s).not.toContain(outside.id);
    const h = await ids(head);
    expect(h).toContain(ready.id);
    expect(h).toContain(outside.id);

    expect((await inst.get('/api/evc/queue')).status).toBe(403);
    expect((await request(app).get('/api/evc/queue')).status).toBe(401);
    expect((await officer.get('/api/evc/queue?page=0')).status).toBe(400);
  });
});

describe('POST /api/evc/:applicationId/schedule', () => {
  it('rejects too little notice (400 MIN_NOTICE) and weekends (400 NOT_WORKING_DAY)', async () => {
    const officer = await agentFor('officer1@demo.test');
    const file = await fileAtEvcEntry(officer);

    const tomorrow = iso(new Date(today.getTime() + DAY));
    const r1 = await schedule(officer, file.id, tomorrow);
    expect(r1.status).toBe(400);
    expect(r1.body.error.code).toBe('MIN_NOTICE');

    let sat = new Date(minDate);
    while (sat.getUTCDay() !== 6) sat = new Date(sat.getTime() + DAY);
    const r2 = await schedule(officer, file.id, iso(sat));
    expect(r2.status).toBe(400);
    expect(r2.body.error.code).toBe('NOT_WORKING_DAY');

    expect((await schedule(officer, file.id, '2026-02-30')).status).toBe(400);
    expect((await schedule(officer, file.id, 'soon')).status).toBe(400);
    // nothing was created
    expect(await prisma.evcVisit.count({ where: { applicationId: file.id } })).toBe(0);
  });

  it('creates the visit and the EVC obligation, moves the file and audits', async () => {
    const officer = await agentFor('officer1@demo.test');
    const file = await fileAtEvcEntry(officer);
    const stages = [...ctx.routes.find((r) => r.id === file.routeId).stages].sort((a, b) => a.orderNo - b.orderNo);

    const res = await schedule(officer, file.id, validIso);
    expect(res.status).toBe(201);
    const { visit, application } = res.body.data;
    expect(visit.status).toBe('PLANNED');
    expect(application.currentStageId).toBe(stages[3].id); // "EVC visit"

    const ob = await prisma.obligation.findFirst({ where: { kind: 'EVC', refId: visit.id } });
    expect(ob.state).toBe('OPEN');
    expect(ob.lastAlertLevel).toBe(0);
    expect(ob.ownerId).toBe(file.assignedOfficerId);
    expect(ob.applicationId).toBe(file.id);
    expect(iso(ob.dueDate)).toBe(validIso);

    // the EVC entry stage obligation is closed
    const entryOb = await prisma.obligation.findFirst({ where: { kind: 'STAGE', refId: stages[2].id, applicationId: file.id } });
    expect(entryOb.state).toBe('DONE');
    expect(await prisma.auditLog.count({ where: { action: 'EVC_SCHEDULED', entityId: file.id } })).toBe(1);

    // gone from the queue; a second schedule is refused
    const q = await officer.get('/api/evc/queue?pageSize=100');
    expect(q.body.data.map((r) => r.id)).not.toContain(file.id);
    expect((await schedule(officer, file.id, validIso)).status).toBe(409);
  });

  it('refuses a file that is not at the EVC scheduling stage (409)', async () => {
    const officer = await agentFor('officer1@demo.test');
    const file = await createApp(officer);
    const res = await schedule(officer, file.id, validIso);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_EVC_READY');
  });

  it('blocks institutions (403), anonymous users (401) and out-of-scope files (404)', async () => {
    const officer = await agentFor('officer1@demo.test');
    const sup = await agentFor('supervisor1@demo.test');
    const head = await agentFor('head1@demo.test');
    const inst = await agentFor('institution1@demo.test');
    const outside = await fileAtEvcEntry(head, { assignedOfficerId: outsideOfficer.id });

    expect((await schedule(inst, outside.id, validIso)).status).toBe(403);
    expect((await request(app).post(`/api/evc/${outside.id}/schedule`).send({ plannedDate: validIso })).status).toBe(401);
    expect((await schedule(officer, outside.id, validIso)).status).toBe(404);
    expect((await schedule(sup, outside.id, validIso)).status).toBe(404);
    expect((await schedule(head, 999999, validIso)).status).toBe(404);
  });

  it('a failure mid-transaction rolls back the visit, obligation, stage move and audit', async () => {
    const officer = await agentFor('officer1@demo.test');
    const file = await fileAtEvcEntry(officer);
    // mimic a seeded file: the next stage has no obligation, so resolveOwners is called
    await prisma.obligation.deleteMany({ where: { applicationId: file.id, refId: { not: (await prisma.application.findUnique({ where: { id: file.id } })).currentStageId } } });

    const spy = vi.spyOn(scheduleService, 'resolveOwners').mockRejectedValueOnce(new Error('boom'));
    const res = await schedule(officer, file.id, validIso);
    spy.mockRestore();

    expect(res.status).toBe(500);
    expect(await prisma.evcVisit.count({ where: { applicationId: file.id } })).toBe(0);
    expect(await prisma.obligation.count({ where: { applicationId: file.id, kind: 'EVC' } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'EVC_SCHEDULED', entityId: file.id } })).toBe(0);
    const row = await prisma.application.findUnique({ where: { id: file.id }, include: { currentStage: true } });
    expect(row.currentStage.isEvcEntry).toBe(true);
  });
});

describe('POST /api/evc/:visitId/complete', () => {
  it('records the visit, closes the obligation, moves the file and audits', async () => {
    const officer = await agentFor('officer1@demo.test');
    const file = await fileAtEvcEntry(officer);
    const stages = [...ctx.routes.find((r) => r.id === file.routeId).stages].sort((a, b) => a.orderNo - b.orderNo);
    const sched = await schedule(officer, file.id, validIso);
    const visitId = sched.body.data.visit.id;

    expect((await finish(officer, visitId, {})).status).toBe(400); // notes required
    const future = iso(new Date(today.getTime() + 3 * DAY));
    expect((await finish(officer, visitId, { committeeNotes: 'x', actualDate: future })).status).toBe(400);

    const res = await finish(officer, visitId, { committeeNotes: 'Labs and library verified' });
    expect(res.status).toBe(200);
    expect(res.body.data.application.currentStageId).toBe(stages[4].id); // "EVC report review"

    const visit = await prisma.evcVisit.findUnique({ where: { id: visitId } });
    expect(visit.status).toBe('COMPLETED');
    expect(iso(visit.actualDate)).toBe(todayIso);
    expect(visit.committeeNotes).toBe('Labs and library verified');
    const ob = await prisma.obligation.findFirst({ where: { kind: 'EVC', refId: visitId } });
    expect(ob.state).toBe('DONE');
    expect(ob.closedOn).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: 'EVC_COMPLETED', entityId: file.id } })).toBe(1);

    expect((await finish(officer, visitId)).status).toBe(409); // already recorded
  });

  it('blocks institutions (403) and out-of-scope visits (404)', async () => {
    const officer = await agentFor('officer1@demo.test');
    const head = await agentFor('head1@demo.test');
    const inst = await agentFor('institution1@demo.test');
    const outside = await fileAtEvcEntry(head, { assignedOfficerId: outsideOfficer.id });
    const sched = await schedule(head, outside.id, validIso);
    const visitId = sched.body.data.visit.id;

    expect((await finish(inst, visitId)).status).toBe(403);
    expect((await finish(officer, visitId)).status).toBe(404);
    expect((await request(app).post(`/api/evc/${visitId}/complete`).send({})).status).toBe(401);
  });

  it('a failure mid-transaction rolls back the visit, obligation, stage move and audit', async () => {
    const officer = await agentFor('officer1@demo.test');
    const file = await fileAtEvcEntry(officer);
    const sched = await schedule(officer, file.id, validIso);
    const visitId = sched.body.data.visit.id;
    const current = sched.body.data.application.currentStageId;
    // the next stage has no obligation, so resolveOwners will be called
    await prisma.obligation.deleteMany({ where: { applicationId: file.id, kind: 'STAGE', refId: { not: current } } });

    const spy = vi.spyOn(scheduleService, 'resolveOwners').mockRejectedValueOnce(new Error('boom'));
    const res = await finish(officer, visitId);
    spy.mockRestore();

    expect(res.status).toBe(500);
    const visit = await prisma.evcVisit.findUnique({ where: { id: visitId } });
    expect(visit.status).toBe('PLANNED');
    expect(visit.actualDate).toBeNull();
    const ob = await prisma.obligation.findFirst({ where: { kind: 'EVC', refId: visitId } });
    expect(ob.state).not.toBe('DONE');
    expect(await prisma.auditLog.count({ where: { action: 'EVC_COMPLETED', entityId: file.id } })).toBe(0);
    const row = await prisma.application.findUnique({ where: { id: file.id } });
    expect(row.currentStageId).toBe(current);
  });
});

describe('GET /api/evc (calendar and list)', () => {
  it('flags a past planned date as LATE and respects scope', async () => {
    const officer = await agentFor('officer1@demo.test');
    const head = await agentFor('head1@demo.test');
    const inst = await agentFor('institution1@demo.test');
    const mine = await fileAtEvcEntry(officer);
    const other = await fileAtEvcEntry(head, { assignedOfficerId: outsideOfficer.id });

    // insert directly: the API refuses past dates
    const yesterday = new Date(today.getTime() - DAY);
    const v1 = await prisma.evcVisit.create({ data: { applicationId: mine.id, plannedDate: yesterday } });
    const v2 = await prisma.evcVisit.create({ data: { applicationId: other.id, plannedDate: yesterday } });

    const q = `?from=${iso(yesterday)}&to=${iso(yesterday)}&status=PLANNED&pageSize=200`;
    const o = await officer.get(`/api/evc${q}`);
    expect(o.status).toBe(200);
    const row = o.body.data.find((r) => r.id === v1.id);
    expect(row.display).toBe('LATE');
    expect(row.appCode).toBeTruthy();
    expect(o.body.data.map((r) => r.id)).not.toContain(v2.id);

    const h = await head.get(`/api/evc${q}`);
    expect(h.body.data.map((r) => r.id)).toEqual(expect.arrayContaining([v1.id, v2.id]));
    expect((await inst.get('/api/evc')).status).toBe(403);
    expect((await officer.get(`/api/evc?applicationId=${mine.id}`)).body.data.map((r) => r.id)).toEqual([v1.id]);
    expect((await officer.get('/api/evc?status=NOPE')).status).toBe(400);
  });
});