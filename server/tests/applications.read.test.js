import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import request from 'supertest';

const require = createRequire(import.meta.url);
const app = require('../src/app.js');
const prisma = require('../src/utils/prisma.js');

const created = [];
const todayIso = new Date().toISOString().slice(0, 10);
const day = (v) => String(v).slice(0, 10);

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

let officer, sup, head, inst;
let officer1, sup1, inst1User, inst1, teamIds, outsideOfficer;
let fileB; // Scrutiny + EVC file owned by officer1 (institution 1)
let otherInstFile; // file of another institution, owned by a team officer
let outsideFile; // file of an officer outside supervisor1's team

beforeAll(async () => {
  [officer, sup, head, inst] = await Promise.all([
    agentFor('officer1@demo.test'),
    agentFor('supervisor1@demo.test'),
    agentFor('head1@demo.test'),
    agentFor('institution1@demo.test'),
  ]);
  officer1 = await prisma.user.findUnique({ where: { email: 'officer1@demo.test' } });
  sup1 = await prisma.user.findUnique({ where: { email: 'supervisor1@demo.test' } });
  inst1User = await prisma.user.findUnique({ where: { email: 'institution1@demo.test' } });
  inst1 = await prisma.institution.findUnique({ where: { id: inst1User.institutionId } });
  teamIds = (await prisma.user.findMany({ where: { role: 'OFFICER', supervisorId: sup1.id } })).map((u) => u.id);
  outsideOfficer = await prisma.user.findFirst({ where: { role: 'OFFICER', supervisorId: { not: sup1.id } } });

  fileB = await createApp(officer);
  otherInstFile = await createApp(head, { institutionId: 2, assignedOfficerId: teamIds[0] });
  outsideFile = await createApp(head, { assignedOfficerId: outsideOfficer.id });
});

afterAll(async () => {
  // test cleanup only: the app itself never deletes rows
  await prisma.obligation.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.stageHistory.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'application', entityId: { in: created } } });
  await prisma.application.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

const list = (agent, query = '') => agent.get(`/api/applications?pageSize=100${query}`);

describe('GET /api/applications (scope)', () => {
  it('officer sees only own files', async () => {
    const res = await list(officer);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((r) => r.officer.id === officer1.id)).toBe(true);
    expect(res.body.meta.total).toBe(await prisma.application.count({ where: { assignedOfficerId: officer1.id } }));
    expect(res.body.data.map((r) => r.id)).not.toContain(outsideFile.id);
  });

  it('supervisor sees only the team', async () => {
    const res = await list(sup);
    expect(res.body.data.every((r) => teamIds.includes(r.officer.id))).toBe(true);
    expect(res.body.meta.total).toBe(
      await prisma.application.count({ where: { assignedOfficer: { supervisorId: sup1.id } } }),
    );
    expect(res.body.data.map((r) => r.id)).not.toContain(outsideFile.id);
  });

  it('institution sees only its own institution', async () => {
    const res = await list(inst);
    expect(res.body.data.every((r) => r.institution.id === inst1User.institutionId)).toBe(true);
    expect(res.body.meta.total).toBe(await prisma.application.count({ where: { institutionId: inst1User.institutionId } }));
    expect(res.body.data.map((r) => r.id)).not.toContain(otherInstFile.id);
  });

  it('head office sees everything', async () => {
    const res = await head.get('/api/applications?pageSize=1');
    expect(res.body.meta.total).toBe(await prisma.application.count());
  });

  it('no login gives 401', async () => {
    expect((await request(app).get('/api/applications')).status).toBe(401);
    expect((await request(app).get('/api/applications/1')).status).toBe(401);
  });
});

describe('GET /api/applications (filters and pagination)', () => {
  it('filters by status', async () => {
    const res = await head.get('/api/applications?status=APPROVED&pageSize=100');
    expect(res.body.data.every((r) => r.status === 'APPROVED')).toBe(true);
    expect(res.body.meta.total).toBe(await prisma.application.count({ where: { status: 'APPROVED' } }));
  });

  it('filters by stage name', async () => {
    const res = await head.get('/api/applications?stage=Document%20scrutiny&pageSize=100');
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((r) => r.currentStage.stageName === 'Document scrutiny')).toBe(true);
    expect(res.body.meta.total).toBe(
      await prisma.application.count({ where: { currentStage: { stageName: 'Document scrutiny' } } }),
    );
  });

  it('filters by region and by officer', async () => {
    const byRegion = await head.get(`/api/applications?region=${encodeURIComponent(inst1.region)}&pageSize=100`);
    expect(byRegion.body.data.every((r) => r.institution.region === inst1.region)).toBe(true);
    expect(byRegion.body.meta.total).toBe(
      await prisma.application.count({ where: { institution: { region: inst1.region } } }),
    );

    const byOfficer = await head.get(`/api/applications?officerId=${officer1.id}&pageSize=100`);
    expect(byOfficer.body.data.every((r) => r.officer.id === officer1.id)).toBe(true);

    // a supervisor asking for an officer outside the team gets nothing (scope wins)
    const outside = await sup.get(`/api/applications?officerId=${outsideOfficer.id}`);
    expect(outside.status).toBe(200);
    expect(outside.body.meta.total).toBe(0);
  });

  it('due range matches the CURRENT stage due date', async () => {
    const firstDue = day(fileB.stages[0].dueDate);
    const res = await list(officer, `&dueFrom=${firstDue}&dueTo=${firstDue}`);
    expect(res.body.data.map((r) => r.id)).toContain(fileB.id);
    expect(res.body.data.every((r) => day(r.nextDueDate) === firstDue)).toBe(true);
  });

  it('a later stage due date does not match', async () => {
    const laterDue = day(fileB.stages[1].dueDate);
    const res = await list(officer, `&dueFrom=${laterDue}&dueTo=${laterDue}`);
    expect(res.body.data.map((r) => r.id)).not.toContain(fileB.id);
  });

  it('paginates without overlap and reports the total', async () => {
    const p1 = await head.get('/api/applications?pageSize=5&page=1');
    const p2 = await head.get('/api/applications?pageSize=5&page=2');
    expect(p1.body.data).toHaveLength(5);
    expect(p2.body.data).toHaveLength(5);
    expect(p1.body.meta).toMatchObject({ page: 1, pageSize: 5 });
    expect(p2.body.meta.page).toBe(2);
    const ids = [...p1.body.data, ...p2.body.data].map((r) => r.id);
    expect(new Set(ids).size).toBe(10);
  });

  it('rejects bad filters with 400', async () => {
    expect((await head.get('/api/applications?pageSize=1000')).status).toBe(400);
    expect((await head.get('/api/applications?status=FOO')).status).toBe(400);
    expect((await head.get('/api/applications?dueFrom=not-a-date')).status).toBe(400);
    expect((await head.get('/api/applications?dueFrom=2026-12-01&dueTo=2026-11-01')).status).toBe(400);
  });

  it('rows carry the next due date, its state and canComplete', async () => {
    const res = await list(officer);
    const row = res.body.data.find((r) => r.id === fileB.id);
    expect(row.nextDueDate).toBeTruthy();
    expect(row.obligationState).toBe('OPEN');
    expect(row.canComplete).toBe(true);
    const instRow = (await list(inst)).body.data.find((r) => r.id === fileB.id);
    expect(instRow.canComplete).toBe(false);
  });
});

describe('GET /api/applications/:id', () => {
  it('officer gets the timeline of an own file', async () => {
    const res = await officer.get(`/api/applications/${fileB.id}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.route.name).toBe('Scrutiny + EVC');
    expect(d.timeline).toHaveLength(6);
    expect(d.timeline.filter((t) => t.state === 'CURRENT')).toHaveLength(1);
    expect(d.timeline[0].state).toBe('CURRENT');
    expect(d.timeline.slice(1).every((t) => t.state === 'UPCOMING' && t.dueDate)).toBe(true);
    expect(d.canComplete).toBe(true);
    expect(d.isLastStage).toBe(false);
  });

  it('the team supervisor and the own institution can read it', async () => {
    expect((await sup.get(`/api/applications/${fileB.id}`)).status).toBe(200);
    const res = await inst.get(`/api/applications/${fileB.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.canComplete).toBe(false);
  });

  it("files outside the caller's scope give 404", async () => {
    expect((await officer.get(`/api/applications/${outsideFile.id}`)).status).toBe(404);
    expect((await sup.get(`/api/applications/${outsideFile.id}`)).status).toBe(404);
    expect((await inst.get(`/api/applications/${otherInstFile.id}`)).status).toBe(404);
  });

  it('a finished seeded file shows every stage as DONE', async () => {
    const closed = await prisma.application.findUnique({ where: { appCode: 'APP-2026-0001' } });
    const res = await head.get(`/api/applications/${closed.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
    expect(res.body.data.timeline.every((t) => t.state === 'DONE')).toBe(true);
    expect(res.body.data.canComplete).toBe(false);
  });

  it('unknown or non-numeric ids give 404', async () => {
    expect((await head.get('/api/applications/999999')).status).toBe(404);
    expect((await head.get('/api/applications/abc')).status).toBe(404);
  });
});

describe('GET /api/applications/filters', () => {
  it('officer sees only themselves; institution sees no officers', async () => {
    const o = await officer.get('/api/applications/filters');
    expect(o.body.data.officers.map((x) => x.id)).toEqual([officer1.id]);
    expect(o.body.data.stages).toContain('Document scrutiny');
    expect((await inst.get('/api/applications/filters')).body.data.officers).toEqual([]);
  });

  it('supervisor sees the team; head office sees all officers', async () => {
    const s = await sup.get('/api/applications/filters');
    expect(s.body.data.officers.map((x) => x.id).sort()).toEqual([...teamIds].sort());
    const h = await head.get('/api/applications/filters');
    expect(h.body.data.officers.length).toBeGreaterThanOrEqual(12);
    expect(h.body.data.regions.length).toBeGreaterThan(0);
  });
});