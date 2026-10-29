import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'node:module';
import request from 'supertest';

const require = createRequire(import.meta.url);
const app = require('../src/app.js');
const prisma = require('../src/utils/prisma.js');
const audit = require('../src/services/audit.js');
const { runDailyCheck } = require('../src/jobs/dailyCheck.js');

const d = (iso) => new Date(`${iso}T00:00:00Z`);
const DUE = '2027-03-10'; // Wed; 3 working days before = Fri 5 Mar 2027
const todayIso = new Date().toISOString().slice(0, 10);
const created = [];
const userIds = [];
let head, officer, file, officer1, sup1, evcOriginal;

const STAGE_ORIGINAL = [2, 0, -1, -3, -7];
const putSteps = (kind, daysBefore) => head.put(`/api/settings/alert-steps/${kind}`).send({ daysBefore });
const stageRules = (extra = {}) => prisma.alertRule.findMany({ where: { kind: 'STAGE', ...extra }, orderBy: { id: 'asc' } });
const mkOb = (ownerId = officer1.id) =>
  prisma.obligation.create({ data: { kind: 'STAGE', applicationId: file.id, ownerId, dueDate: d(DUE) } });
const notes = (ob, channel) =>
  prisma.notification.findMany({ where: { obligationId: ob.id, channel }, orderBy: { id: 'asc' } });
const run = (asOf, ob) => runDailyCheck({ asOf, obligationIds: [ob.id] });

async function agentFor(email) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: 'Demo@1234' });
  return agent;
}

beforeAll(async () => {
  [head, officer] = await Promise.all([agentFor('head1@demo.test'), agentFor('officer1@demo.test')]);
  const res = await officer
    .post('/api/applications')
    .send({ institutionId: 1, newOrExisting: 'NEW', programmeLevel: 'UG', submittedOn: todayIso });
  expect(res.status).toBe(201);
  file = res.body.data;
  created.push(file.id);
  officer1 = await prisma.user.findUnique({ where: { email: 'officer1@demo.test' } });
  sup1 = await prisma.user.findUnique({ where: { email: 'supervisor1@demo.test' } });
  evcOriginal = await prisma.evcRule.findFirst({ where: { active: true }, orderBy: { id: 'desc' } });
});

afterAll(async () => {
  // test cleanup only: put the seeded settings back, then delete what the tests created
  await prisma.alertRule.updateMany({ where: { kind: 'STAGE', daysBefore: 3 }, data: { daysBefore: 2 } });
  await prisma.alertRule.updateMany({ where: { kind: 'STAGE', level: 'REMINDER_SENT' }, data: { active: true } });
  await prisma.evcRule.update({ where: { id: evcOriginal.id }, data: { minNoticeDays: evcOriginal.minNoticeDays } });
  await prisma.auditLog.deleteMany({ where: { action: { startsWith: 'SETTINGS_' } } });
  const obs = await prisma.obligation.findMany({ where: { applicationId: { in: created } }, select: { id: true } });
  const obIds = obs.map((o) => o.id);
  await prisma.notification.deleteMany({ where: { obligationId: { in: obIds } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'obligation', entityId: { in: obIds } } });
  await prisma.obligation.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.stageHistory.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'application', entityId: { in: created } } });
  await prisma.application.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe('GET /api/settings', () => {
  it('returns the steps of every kind and the EVC minimum notice', async () => {
    const res = await head.get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.data.kinds.map((k) => k.kind)).toEqual(['STAGE', 'EVC', 'UNDERTAKING', 'DOCUMENT']);
    const stage = res.body.data.kinds[0].steps;
    expect(stage.map((s) => s.daysBefore)).toEqual(STAGE_ORIGINAL);
    expect(stage[0]).toMatchObject({ step: 1, level: 'REMINDER_SENT' });
    expect(stage[0].rules.map((r) => r.channel).sort()).toEqual(['EMAIL', 'IN_APP']);
    expect(res.body.data.kinds[1].steps).toHaveLength(7); // EVC
    expect(typeof res.body.data.evcMinNoticeDays).toBe('number');
  });

  it('is head office only', async () => {
    expect((await officer.get('/api/settings')).status).toBe(403);
    expect((await officer.put('/api/settings/alert-steps/STAGE').send({ daysBefore: STAGE_ORIGINAL })).status).toBe(403);
    expect((await request(app).get('/api/settings')).status).toBe(401);
  });
});

describe('alert steps', () => {
  it('a change applies from the next run, moves both channels, is audited, and can be undone', async () => {
    const ob1 = await mkOb();
    expect((await run('2027-03-05', ob1)).fired).toBe(0); // 3 working days left, reminder is at 2

    const res = await putSteps('STAGE', [3, 0, -1, -3, -7]);
    expect(res.status).toBe(200);
    expect(res.body.data.changed).toBe(true);
    expect(await stageRules({ daysBefore: 3 })).toHaveLength(2); // IN_APP and EMAIL together
    expect(await prisma.auditLog.count({ where: { action: 'SETTINGS_ALERT_STEPS_UPDATED' } })).toBe(1);

    const fired = await run('2027-03-05', ob1);
    expect(fired.fired).toBe(1);
    expect(await prisma.obligation.findUnique({ where: { id: ob1.id } })).toMatchObject({
      state: 'REMINDER_SENT',
      lastAlertLevel: 1,
    });

    const back = await putSteps('STAGE', STAGE_ORIGINAL);
    expect(back.status).toBe(200);
    expect((await stageRules()).map((r) => r.daysBefore).sort((a, b) => b - a)).toEqual(
      [2, 2, 0, 0, -1, -1, -3, -3, -7, -7],
    );
    // sending the same values again changes nothing and writes no audit row
    const same = await putSteps('STAGE', STAGE_ORIGINAL);
    expect(same.body.data.changed).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: 'SETTINGS_ALERT_STEPS_UPDATED' } })).toBe(2);
  });

  it('rejects values that would break the ladder, and changes nothing', async () => {
    expect((await putSteps('STAGE', [2, 0, -1, -3])).status).toBe(400); // wrong number of steps
    expect((await putSteps('STAGE', [2, 2, -1, -3, -7])).status).toBe(400); // not strictly descending
    expect((await putSteps('STAGE', [2, 1, -1, -3, -7])).status).toBe(400); // DUE_TODAY must be 0
    expect((await putSteps('NOPE', [1])).status).toBe(400);
    expect((await head.put('/api/settings/alert-steps/STAGE').send({ daysBefore: ['a'] })).status).toBe(400);
    expect((await stageRules()).map((r) => r.daysBefore).sort((a, b) => b - a)).toEqual(
      [2, 2, 0, 0, -1, -1, -3, -3, -7, -7],
    );
  });
});

describe('alert rules', () => {
  it('a deactivated channel is not used by the next run; the last active rule of a step is protected', async () => {
    const [stepOne] = (await head.get('/api/settings')).body.data.kinds[0].steps;
    const email = stepOne.rules.find((r) => r.channel === 'EMAIL');
    const inApp = stepOne.rules.find((r) => r.channel === 'IN_APP');

    expect((await head.patch(`/api/settings/alert-rules/${email.id}`).send({ active: false })).status).toBe(200);
    const last = await head.patch(`/api/settings/alert-rules/${inApp.id}`).send({ active: false });
    expect(last.status).toBe(409);
    expect(last.body.error.code).toBe('LAST_ACTIVE_RULE');

    const ob1 = await mkOb();
    expect((await run('2027-03-08', ob1)).fired).toBe(1); // 2 working days before: step 1
    expect(await notes(ob1, 'IN_APP')).toHaveLength(1);
    expect(await notes(ob1, 'EMAIL')).toHaveLength(0);

    expect((await head.patch(`/api/settings/alert-rules/${email.id}`).send({ active: true })).status).toBe(200);
    const ob2 = await mkOb();
    await run('2027-03-08', ob2);
    expect(await notes(ob2, 'EMAIL')).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { action: 'SETTINGS_ALERT_RULE_UPDATED', entityId: email.id } })).toBe(2);
  });

  it('validates input and a failing audit write rolls the change back', async () => {
    const [rule] = await stageRules();
    expect((await head.patch(`/api/settings/alert-rules/${rule.id}`).send({})).status).toBe(400);
    expect((await head.patch(`/api/settings/alert-rules/${rule.id}`).send({ channel: 'FAX' })).status).toBe(400);
    expect((await head.patch('/api/settings/alert-rules/99999999').send({ active: false })).status).toBe(404);

    const other = (await stageRules({ daysBefore: rule.daysBefore })).find((r) => r.id !== rule.id);
    expect(other).toBeTruthy(); // so deactivating `rule` is allowed and only the audit write fails
    const spy = vi.spyOn(audit, 'logAction').mockRejectedValueOnce(new Error('boom'));
    const res = await head.patch(`/api/settings/alert-rules/${rule.id}`).send({ active: false });
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect((await prisma.alertRule.findUnique({ where: { id: rule.id } })).active).toBe(true);
  });
});

describe('EVC minimum notice', () => {
  it('updates the rule the EVC service reads, and validates', async () => {
    const res = await head.patch('/api/settings/evc-min-notice').send({ minNoticeDays: 9 });
    expect(res.status).toBe(200);
    const now = await prisma.evcRule.findFirst({ where: { active: true }, orderBy: { id: 'desc' } });
    expect(now.minNoticeDays).toBe(9);
    expect((await head.get('/api/settings')).body.data.evcMinNoticeDays).toBe(9);
    expect(await prisma.auditLog.count({ where: { action: 'SETTINGS_EVC_MIN_NOTICE_UPDATED' } })).toBe(1);
    expect((await head.patch('/api/settings/evc-min-notice').send({ minNoticeDays: -1 })).status).toBe(400);
    expect((await head.patch('/api/settings/evc-min-notice').send({ minNoticeDays: 31 })).status).toBe(400);
    expect((await head.patch('/api/settings/evc-min-notice').send({ minNoticeDays: evcOriginal.minNoticeDays })).status).toBe(200);
  });
});

describe('escalation target', () => {
  const mkOfficer = async (supervisorId) => {
    const u = await prisma.user.create({
      data: {
        name: 'Test officer',
        email: `test-esc-${Date.now()}-${userIds.length}@demo.test`,
        passwordHash: 'x',
        role: 'OFFICER',
        region: officer1.region,
        supervisorId,
      },
    });
    userIds.push(u.id);
    return u;
  };
  const escalatedTo = async (u) => {
    const ob = await mkOb(u.id);
    await run('2027-03-15', ob); // 3 working days overdue: ESCALATED
    return (await notes(ob, 'IN_APP')).map((n) => n.userId);
  };

  it('goes to the owner\'s supervisor when there is one', async () => {
    const u = await mkOfficer(sup1.id);
    expect(await escalatedTo(u)).toEqual([sup1.id]);
  });

  it('goes to the head-office user of the region when there is no supervisor', async () => {
    const u = await mkOfficer(null);
    const regional = await prisma.user.findFirst({ where: { role: 'HEAD_OFFICE', active: true, region: u.region } });
    const expected = regional || (await prisma.user.findFirst({ where: { role: 'HEAD_OFFICE', active: true }, orderBy: { id: 'asc' } }));
    expect(await escalatedTo(u)).toEqual([expected.id]);
  });
});