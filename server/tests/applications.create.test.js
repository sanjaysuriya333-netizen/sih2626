import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'node:module';
import request from 'supertest';

const require = createRequire(import.meta.url);
const app = require('../src/app.js');
const prisma = require('../src/utils/prisma.js');
const scheduleService = require('../src/services/scheduleService.js');

const created = []; // ids of applications made by these tests, removed in afterAll

async function agentFor(email) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: 'Demo@1234' });
  return agent;
}
const body = (over = {}) => ({
  institutionId: 1,
  newOrExisting: 'NEW',
  programmeLevel: 'UG',
  submittedOn: '2026-10-26',
  ...over,
});
const track = (res) => {
  if (res.status === 201) created.push(res.body.data.id);
  return res;
};

let officer1, sup1, teamOfficer, outsideOfficer, inst1User, inst1;

beforeAll(async () => {
  officer1 = await prisma.user.findUnique({ where: { email: 'officer1@demo.test' } });
  sup1 = await prisma.user.findUnique({ where: { email: 'supervisor1@demo.test' } });
  inst1User = await prisma.user.findUnique({ where: { email: 'institution1@demo.test' } });
  inst1 = await prisma.institution.findUnique({ where: { id: inst1User.institutionId } });
  teamOfficer = await prisma.user.findFirst({ where: { role: 'OFFICER', supervisorId: sup1.id } });
  outsideOfficer = await prisma.user.findFirst({
    where: { role: 'OFFICER', supervisorId: { not: sup1.id } },
  });
});

afterAll(async () => {
  // test cleanup only: the app itself never deletes rows
  await prisma.obligation.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.stageHistory.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'application', entityId: { in: created } } });
  await prisma.application.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe('POST /api/applications', () => {
  it('officer creates a file: route, stages, history, obligations and audit row', async () => {
    const agent = await agentFor('officer1@demo.test');
    const res = track(await agent.post('/api/applications').send(body()));
    expect(res.status).toBe(201);
    const d = res.body.data;
    expect(d.routeName).toBe('Scrutiny + EVC');
    expect(d.assignedOfficerId).toBe(officer1.id);
    expect(d.appCode).toMatch(/^APP-2026-\d{4,}$/);
    expect(d.stages).toHaveLength(6);

    const obligations = await prisma.obligation.findMany({ where: { applicationId: d.id, kind: 'STAGE' } });
    expect(obligations).toHaveLength(6);
    expect(await prisma.stageHistory.count({ where: { applicationId: d.id } })).toBe(1);
    expect(
      await prisma.auditLog.count({ where: { action: 'APPLICATION_CREATED', entityId: d.id } }),
    ).toBe(1);
  });

  it('institution: own institution is forced and an officer from its region is assigned', async () => {
    const agent = await agentFor('institution1@demo.test');
    const res = track(await agent.post('/api/applications').send(body({ institutionId: 999 })));
    expect(res.status).toBe(201);
    expect(res.body.data.institutionId).toBe(inst1User.institutionId);
    const assigned = await prisma.user.findUnique({ where: { id: res.body.data.assignedOfficerId } });
    expect(assigned.region).toBe(inst1.region);
  });

  it('supervisor must name an officer', async () => {
    const agent = await agentFor('supervisor1@demo.test');
    const res = await agent.post('/api/applications').send(body());
    expect(res.status).toBe(400);
  });

  it('supervisor cannot assign an officer outside the team', async () => {
    const agent = await agentFor('supervisor1@demo.test');
    const res = await agent.post('/api/applications').send(body({ assignedOfficerId: outsideOfficer.id }));
    expect(res.status).toBe(403);
  });

  it('supervisor assigns a team officer', async () => {
    const agent = await agentFor('supervisor1@demo.test');
    const res = track(await agent.post('/api/applications').send(body({ assignedOfficerId: teamOfficer.id })));
    expect(res.status).toBe(201);
    expect(res.body.data.assignedOfficerId).toBe(teamOfficer.id);
  });

  it('head office assigns any officer', async () => {
    const agent = await agentFor('head1@demo.test');
    const res = track(
      await agent.post('/api/applications').send(body({ assignedOfficerId: outsideOfficer.id })),
    );
    expect(res.status).toBe(201);
  });

  it('no login gives 401', async () => {
    expect((await request(app).post('/api/applications').send(body())).status).toBe(401);
  });

  it('bad data gives 400 and creates nothing', async () => {
    const agent = await agentFor('officer1@demo.test');
    const before = await prisma.application.count();
    const res = await agent.post('/api/applications').send(body({ programmeLevel: 'PHD' }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.application.count()).toBe(before);
  });

  it('a failure mid-transaction rolls everything back', async () => {
    const agent = await agentFor('officer1@demo.test');
    const apps = await prisma.application.count();
    const audits = await prisma.auditLog.count({ where: { action: 'APPLICATION_CREATED' } });
    const spy = vi.spyOn(scheduleService, 'persistSchedule').mockRejectedValueOnce(new Error('boom'));
    const res = await agent.post('/api/applications').send(body());
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await prisma.application.count()).toBe(apps);
    expect(await prisma.auditLog.count({ where: { action: 'APPLICATION_CREATED' } })).toBe(audits);
  });
});