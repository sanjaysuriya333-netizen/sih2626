import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import request from 'supertest';

const require = createRequire(import.meta.url);
const app = require('../src/app.js');
const prisma = require('../src/utils/prisma.js');
const { todayInIst } = require('../src/jobs/dailyCheck.js');

const DAY = 24 * 60 * 60 * 1000;
const OPEN_STATES = ['OPEN', 'REMINDER_SENT', 'DUE_TODAY'];
const iso = (d) => d.toISOString().slice(0, 10);
const created = [];
let head, sup, officer, inst, officer1, sup1, inst1;

async function agentFor(email) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: 'Demo@1234' });
  return agent;
}
const get = (agent, path) => agent.get(`/api/dashboard${path}`);
const data = async (agent, path) => {
  const res = await get(agent, path);
  expect(res.status, path).toBe(200);
  return res.body.data;
};
async function createApp(over = {}) {
  const res = await officer
    .post('/api/applications')
    .send({ institutionId: 1, newOrExisting: 'NEW', programmeLevel: 'UG', ...over });
  expect(res.status).toBe(201);
  created.push(res.body.data.id);
  return res.body.data;
}

beforeAll(async () => {
  [head, sup, officer, inst] = await Promise.all([
    agentFor('head1@demo.test'),
    agentFor('supervisor1@demo.test'),
    agentFor('officer1@demo.test'),
    agentFor('institution1@demo.test'),
  ]);
  officer1 = await prisma.user.findUnique({ where: { email: 'officer1@demo.test' } });
  sup1 = await prisma.user.findUnique({ where: { email: 'supervisor1@demo.test' } });
  inst1 = await prisma.user.findUnique({ where: { email: 'institution1@demo.test' } });
});

afterAll(async () => {
  // test cleanup only: the app itself never deletes rows
  await prisma.obligation.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.stageHistory.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'application', entityId: { in: created } } });
  await prisma.application.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe('summary', () => {
  it('head office numbers equal direct database counts (the rules of npm run seed:check)', async () => {
    const today = todayInIst();
    const weekEnd = new Date(today.getTime() + 6 * DAY);
    const s = await data(head, '/summary');
    expect(s.asOf).toBe(iso(today));
    expect(s.inProgress).toBe(await prisma.application.count({ where: { status: 'IN_PROGRESS' } }));
    expect(s.dueThisWeek).toBe(
      await prisma.obligation.count({
        where: { kind: 'STAGE', state: { in: OPEN_STATES }, dueDate: { gte: today, lte: weekEnd } },
      }),
    );
    expect(s.dueToday).toBe(
      await prisma.obligation.count({ where: { kind: 'STAGE', state: { in: OPEN_STATES }, dueDate: today } }),
    );
    expect(s.overdue).toBe(await prisma.obligation.count({ where: { state: 'OVERDUE' } }));
    expect(s.escalated).toBe(await prisma.obligation.count({ where: { state: 'ESCALATED' } }));
    expect(s.reported).toBe(await prisma.obligation.count({ where: { state: 'REPORTED' } }));
    expect(Object.keys(s.byKind)).toEqual(['STAGE', 'EVC', 'UNDERTAKING', 'DOCUMENT']);
    expect(s.byStatus.IN_PROGRESS).toBe(s.inProgress);
  });

  it('every role only counts its own scope', async () => {
    const inProgress = { status: 'IN_PROGRESS' };
    expect((await data(officer, '/summary')).inProgress).toBe(
      await prisma.application.count({ where: { ...inProgress, assignedOfficerId: officer1.id } }),
    );
    expect((await data(sup, '/summary')).inProgress).toBe(
      await prisma.application.count({ where: { ...inProgress, assignedOfficer: { supervisorId: sup1.id } } }),
    );
    expect((await data(inst, '/summary')).inProgress).toBe(
      await prisma.application.count({ where: { ...inProgress, institutionId: inst1.institutionId } }),
    );
    expect((await data(officer, '/summary')).overdue).toBe(
      await prisma.obligation.count({
        where: { state: 'OVERDUE', application: { is: { assignedOfficerId: officer1.id } } },
      }),
    );
  });

  it('a later stage of a file is not counted as due (only the current stage is)', async () => {
    const today = todayInIst();
    const weekEnd = new Date(today.getTime() + 6 * DAY);
    const file = await createApp({ submittedOn: iso(today) });
    const direct = () =>
      prisma.obligation.count({
        where: {
          kind: 'STAGE',
          state: { in: OPEN_STATES },
          dueDate: { gte: today, lte: weekEnd },
          application: { is: { assignedOfficerId: officer1.id } },
        },
      });
    const liveBefore = (await data(officer, '/summary')).dueThisWeek;
    const directBefore = await direct();

    const stages = await prisma.routeStage.findMany({ where: { routeId: file.routeId }, orderBy: { orderNo: 'asc' } });
    const later = stages[stages.length - 1];
    await prisma.obligation.updateMany({
      where: { applicationId: file.id, kind: 'STAGE', refId: later.id },
      data: { dueDate: today },
    });

    expect(await direct()).toBe(directBefore + 1); // a plain count would include it
    expect((await data(officer, '/summary')).dueThisWeek).toBe(liveBefore); // the dashboard does not
  });
});

describe('breakdown', () => {
  it('region, stage and status groups equal direct counts', async () => {
    const s = await data(head, '/summary');
    const byRegion = await data(head, '/breakdown?by=region');
    expect(byRegion.length).toBeGreaterThan(1);
    expect(byRegion.reduce((n, g) => n + g.total, 0)).toBe(s.inProgress);
    for (const g of byRegion) {
      expect(g.total).toBe(
        await prisma.application.count({ where: { status: 'IN_PROGRESS', institution: { region: g.label } } }),
      );
    }
    expect(byRegion.reduce((n, g) => n + g.overdue, 0)).toBe(s.byKind.STAGE.OVERDUE || 0);
    expect(byRegion.reduce((n, g) => n + g.escalated, 0)).toBe(
      (s.byKind.STAGE.ESCALATED || 0) + (s.byKind.STAGE.REPORTED || 0),
    );

    const byStage = await data(head, '/breakdown?by=stage');
    expect(byStage.reduce((n, g) => n + g.total, 0)).toBe(s.inProgress);
    expect(byStage[0].total).toBe(
      await prisma.application.count({ where: { status: 'IN_PROGRESS', currentStage: { stageName: byStage[0].label } } }),
    );
    for (let i = 1; i < byStage.length; i += 1) expect(byStage[i - 1].total).toBeGreaterThanOrEqual(byStage[i].total);

    const byStatus = await data(head, '/breakdown?by=status');
    expect(byStatus.reduce((n, g) => n + g.total, 0)).toBe(await prisma.application.count());
    const byInstitution = await data(head, '/breakdown?by=institution');
    expect(byInstitution.reduce((n, g) => n + g.total, 0)).toBe(s.inProgress);
  });

  it('officer, supervisor and institution only see their own groups', async () => {
    const mine = await data(officer, '/breakdown?by=officer');
    expect(mine).toHaveLength(1);
    expect(mine[0].key).toBe(officer1.id);

    const team = await data(sup, '/breakdown?by=officer');
    const teamIds = (await prisma.user.findMany({ where: { supervisorId: sup1.id }, select: { id: true } })).map((u) => u.id);
    expect(team.length).toBeGreaterThan(0);
    for (const g of team) expect(teamIds).toContain(g.key);

    const own = await data(inst, '/breakdown?by=institution');
    expect(own.every((g) => g.key === inst1.institutionId)).toBe(true);
  });
});

describe('filters', () => {
  it('region, stage and due-date filters narrow every number the same way', async () => {
    const regions = await data(head, '/breakdown?by=region');
    const region = regions[0].label;
    expect((await data(head, `/summary?region=${encodeURIComponent(region)}`)).inProgress).toBe(regions[0].total);

    const stages = await data(head, '/breakdown?by=stage');
    const stage = stages[0];
    expect((await data(head, `/summary?stage=${encodeURIComponent(stage.label)}`)).inProgress).toBe(stage.total);

    const today = todayInIst();
    const from = iso(today);
    const to = iso(new Date(today.getTime() + 6 * DAY));
    const list = await head.get(`/api/applications?status=IN_PROGRESS&dueFrom=${from}&dueTo=${to}&pageSize=1`);
    expect((await data(head, `/summary?dueFrom=${from}&dueTo=${to}`)).inProgress).toBe(list.body.meta.total);
  });
});

describe('ageing and stage durations', () => {
  it('ageing buckets add up, and an old file lands in 61+ days', async () => {
    const before = await data(officer, '/ageing');
    const inProgress = (await data(officer, '/summary')).inProgress;
    expect(before.buckets.map((b) => b.label)).toEqual(['0-7 days', '8-14 days', '15-30 days', '31-60 days', '61+ days']);
    expect(before.buckets.reduce((n, b) => n + b.count, 0)).toBe(inProgress);
    expect(before.total).toBe(inProgress);

    await createApp({ submittedOn: iso(new Date(todayInIst().getTime() - 100 * DAY)) });
    const after = await data(officer, '/ageing');
    expect(after.buckets[4].count).toBe(before.buckets[4].count + 1);
    expect(after.total).toBe(before.total + 1);
  });

  it('average days per stage equal a direct calculation', async () => {
    const rows = await prisma.stageHistory.findMany({
      where: { completedOn: { not: null } },
      select: { enteredOn: true, completedOn: true, stage: { select: { stageName: true } } },
    });
    const res = await data(head, '/stage-durations');
    expect(res.reduce((n, r) => n + r.count, 0)).toBe(rows.length);

    const name = res[0].stageName;
    const mine = rows.filter((r) => r.stage.stageName === name);
    const avg = mine.reduce((n, r) => n + (r.completedOn - r.enteredOn) / DAY, 0) / mine.length;
    expect(res[0].avgDays).toBeCloseTo(Math.round(avg * 10) / 10, 5);

    const own = await data(officer, '/stage-durations');
    expect(own.reduce((n, r) => n + r.count, 0)).toBe(
      await prisma.stageHistory.count({
        where: { completedOn: { not: null }, application: { is: { assignedOfficerId: officer1.id } } },
      }),
    );
  });
});

describe('validation and login', () => {
  it('rejects bad input and anonymous callers', async () => {
    expect((await get(head, '/breakdown')).status).toBe(400); // by is required
    expect((await get(head, '/breakdown?by=nope')).status).toBe(400);
    expect((await get(head, '/summary?dueFrom=2026-13-40')).status).toBe(400);
    expect((await get(head, '/summary?dueFrom=2026-12-10&dueTo=2026-12-01')).status).toBe(400);
    expect((await get(head, '/summary?region=')).status).toBe(200); // an empty filter is "not set"
    for (const path of ['/summary', '/breakdown?by=region', '/ageing', '/stage-durations']) {
      expect((await request(app).get(`/api/dashboard${path}`)).status, path).toBe(401);
    }
  });
});