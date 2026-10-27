import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'node:module';
import request from 'supertest';

const require = createRequire(import.meta.url);
const app = require('../src/app.js');
const prisma = require('../src/utils/prisma.js');
const scheduleService = require('../src/services/scheduleService.js');
const { loadRulesContext } = require('../src/services/rulesData.js');
const { addWorkingDays, startOfUtcDay } = require('../src/services/workingDays.js');

const created = [];
const today = startOfUtcDay(new Date());
const todayIso = today.toISOString().slice(0, 10);
const iso = (d) => d.toISOString().slice(0, 10);

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
const complete = (agent, id, body = {}) => agent.post(`/api/applications/${id}/stages/complete`).send(body);

let ctx, holidays, outsideOfficer;

beforeAll(async () => {
  ctx = await loadRulesContext(prisma);
  holidays = ctx.holidays;
  const sup1 = await prisma.user.findUnique({ where: { email: 'supervisor1@demo.test' } });
  outsideOfficer = await prisma.user.findFirst({ where: { role: 'OFFICER', supervisorId: { not: sup1.id } } });
});

afterAll(async () => {
  // test cleanup only: the app itself never deletes rows
  await prisma.obligation.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.stageHistory.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'application', entityId: { in: created } } });
  await prisma.application.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe('POST /api/applications/:id/stages/complete', () => {
  it('walks Scrutiny + EVC end to end with the right dates, history, flag and audit', async () => {
    const officer = await agentFor('officer1@demo.test');
    const sup = await agentFor('supervisor1@demo.test');
    const file = await createApp(officer);
    const stages = [...ctx.routes.find((r) => r.id === file.routeId).stages].sort((a, b) => a.orderNo - b.orderNo);
    expect(stages).toHaveLength(6);

    // expected due dates when stage `from` starts today
    const chain = (from) => {
      let start = today;
      return stages.slice(from).map((s) => (start = addWorkingDays(start, s.maxDays, holidays)));
    };

    for (let i = 0; i < 5; i++) {
      const res = await complete(officer, file.id);
      expect(res.status).toBe(200);
      expect(res.body.data.currentStageId).toBe(stages[i + 1].id);
      expect(res.body.data.nextStage.stageName).toBe(stages[i + 1].stageName);
      // entering "EVC scheduling" (index 2) makes the file EVC-ready
      expect(res.body.data.evcReady).toBe(i + 1 >= 2);

      const open = await prisma.obligation.findMany({
        where: { applicationId: file.id, kind: 'STAGE', state: { not: 'DONE' } },
        orderBy: { dueDate: 'asc' },
      });
      expect(open.map((o) => iso(o.dueDate))).toEqual(chain(i + 1).map(iso));
    }

    // last stage is owned by SUPERVISOR
    expect((await complete(officer, file.id, { decision: 'APPROVED' })).status).toBe(403);
    expect((await complete(sup, file.id)).status).toBe(400); // decision missing
    const last = await complete(sup, file.id, { decision: 'APPROVED', remarks: 'All good' });
    expect(last.status).toBe(200);
    expect(last.body.data.status).toBe('APPROVED');
    expect(last.body.data.nextStage).toBeNull();
    expect(last.body.data.closedOn).toBeTruthy();

    const history = await prisma.stageHistory.findMany({ where: { applicationId: file.id } });
    expect(history).toHaveLength(6);
    expect(history.every((h) => h.completedOn && h.completedBy)).toBe(true);
    const obligations = await prisma.obligation.findMany({ where: { applicationId: file.id } });
    expect(obligations.every((o) => o.state === 'DONE' && o.closedOn)).toBe(true);
    const row = await prisma.application.findUnique({ where: { id: file.id } });
    expect(row.status).toBe('APPROVED');
    expect(row.closedOn).not.toBeNull();
    expect(row.evcReadyOn).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: 'STAGE_COMPLETED', entityId: file.id } })).toBe(6);
    expect(await prisma.auditLog.count({ where: { action: 'APPLICATION_CREATED', entityId: file.id } })).toBe(1);

    expect((await complete(sup, file.id, { decision: 'APPROVED' })).status).toBe(409);
  });

  it('stage owner rules and decision rules on Only scrutiny (rejection path)', async () => {
    const officer = await agentFor('officer1@demo.test');
    const sup = await agentFor('supervisor1@demo.test');
    const file = await createApp(officer, { newOrExisting: 'EXISTING' }); // OFFICER, OFFICER, INSTITUTION, SUPERVISOR

    expect((await complete(officer, file.id, { decision: 'APPROVED' })).status).toBe(400); // not the last stage
    for (let i = 0; i < 3; i++) expect((await complete(officer, file.id)).status).toBe(200);
    expect((await complete(officer, file.id, { decision: 'REJECTED' })).status).toBe(403);
    expect((await complete(sup, file.id)).status).toBe(400);
    const res = await complete(sup, file.id, { decision: 'REJECTED' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REJECTED');
  });

  it('an officer cannot complete a stage on another officer\'s file (404)', async () => {
    const head = await agentFor('head1@demo.test');
    const officer = await agentFor('officer1@demo.test');
    const file = await createApp(head, { assignedOfficerId: outsideOfficer.id });
    expect((await complete(officer, file.id)).status).toBe(404);
  });

  it("a supervisor cannot complete a stage on another team's file (404)", async () => {
    const head = await agentFor('head1@demo.test');
    const sup = await agentFor('supervisor1@demo.test');
    const file = await createApp(head, { assignedOfficerId: outsideOfficer.id });
    expect((await complete(sup, file.id)).status).toBe(404);
  });

  it('an institution cannot complete stages (403)', async () => {
    const officer = await agentFor('officer1@demo.test');
    const inst = await agentFor('institution1@demo.test');
    const file = await createApp(officer);
    expect((await complete(inst, file.id)).status).toBe(403);
  });

  it('no login gives 401', async () => {
    expect((await request(app).post('/api/applications/1/stages/complete').send({})).status).toBe(401);
  });

  it('an invalid decision value gives 400', async () => {
    const officer = await agentFor('officer1@demo.test');
    const file = await createApp(officer);
    expect((await complete(officer, file.id, { decision: 'MAYBE' })).status).toBe(400);
  });

  it('a finished seeded file gives 409', async () => {
    const head = await agentFor('head1@demo.test');
    const closed = await prisma.application.findUnique({ where: { appCode: 'APP-2026-0001' } });
    expect((await complete(head, closed.id, { decision: 'APPROVED' })).status).toBe(409);
  });

  it('a seeded-style file (only the current obligation exists) gets the next obligation', async () => {
    const officer = await agentFor('officer1@demo.test');
    const file = await createApp(officer, { newOrExisting: 'EXISTING' });
    // mimic the seed: keep only the current stage's obligation
    await prisma.obligation.deleteMany({ where: { applicationId: file.id, refId: { not: file.currentStageId } } });

    expect((await complete(officer, file.id)).status).toBe(200);
    const obligations = await prisma.obligation.findMany({ where: { applicationId: file.id } });
    expect(obligations).toHaveLength(2);
    const fresh = obligations.find((o) => o.state === 'OPEN');
    expect(fresh.refId).not.toBe(file.currentStageId);
    expect(fresh.ownerId).toBe(file.assignedOfficerId);
  });

  it('a failure mid-transaction rolls back history, obligation, file and audit', async () => {
    const officer = await agentFor('officer1@demo.test');
    const file = await createApp(officer, { newOrExisting: 'EXISTING' });
    await prisma.obligation.deleteMany({ where: { applicationId: file.id, refId: { not: file.currentStageId } } });

    const spy = vi.spyOn(scheduleService, 'resolveOwners').mockRejectedValueOnce(new Error('boom'));
    const res = await complete(officer, file.id);
    spy.mockRestore();

    expect(res.status).toBe(500);
    const row = await prisma.application.findUnique({ where: { id: file.id } });
    expect(row.currentStageId).toBe(file.currentStageId);
    const history = await prisma.stageHistory.findMany({ where: { applicationId: file.id } });
    expect(history).toHaveLength(1);
    expect(history[0].completedOn).toBeNull();
    const obligation = await prisma.obligation.findFirst({ where: { applicationId: file.id } });
    expect(obligation.state).not.toBe('DONE');
    expect(await prisma.auditLog.count({ where: { action: 'STAGE_COMPLETED', entityId: file.id } })).toBe(0);
  });
});