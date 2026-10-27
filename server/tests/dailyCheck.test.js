import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'node:module';
import request from 'supertest';

const require = createRequire(import.meta.url);
const app = require('../src/app.js');
const prisma = require('../src/utils/prisma.js');
const audit = require('../src/services/audit.js');
const scheduleService = require('../src/services/scheduleService.js');
const { runDailyCheck } = require('../src/jobs/dailyCheck.js');

const DAY = 24 * 60 * 60 * 1000;
const d = (iso) => new Date(`${iso}T00:00:00Z`);
const addIso = (iso, n) => new Date(d(iso).getTime() + n * DAY).toISOString().slice(0, 10);
const todayIso = new Date().toISOString().slice(0, 10);

// Fixed dates in 2027 (no seeded holidays in March or June), so the tests never depend on today.
// Wed 10 Mar 2027 is the due date of the working-day kinds.
const DUE = '2027-03-10';
const created = []; // application ids made by these tests
let file, officer1, owners;

const run = (asOf, ids) => runDailyCheck({ asOf, obligationIds: ids });
const reload = (ob) => prisma.obligation.findUnique({ where: { id: ob.id } });
const notes = (ob) => prisma.notification.findMany({ where: { obligationId: ob.id }, orderBy: { id: 'asc' } });
const audits = (ob) => prisma.auditLog.count({ where: { entity: 'obligation', entityId: ob.id } });
const mkOb = (kind, due, extra = {}) =>
  prisma.obligation.create({
    data: { kind, applicationId: file.id, ownerId: officer1.id, dueDate: d(due), ...extra },
  });

beforeAll(async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'officer1@demo.test', password: 'Demo@1234' });
  const res = await agent
    .post('/api/applications')
    .send({ institutionId: 1, newOrExisting: 'NEW', programmeLevel: 'UG', submittedOn: todayIso });
  expect(res.status).toBe(201);
  file = res.body.data;
  created.push(file.id);
  officer1 = await prisma.user.findUnique({ where: { email: 'officer1@demo.test' } });
  owners = await scheduleService.resolveOwners(prisma, officer1.id);
});

afterAll(async () => {
  // test cleanup only: the app itself never deletes rows
  const obs = await prisma.obligation.findMany({ where: { applicationId: { in: created } }, select: { id: true } });
  const obIds = obs.map((o) => o.id);
  await prisma.notification.deleteMany({ where: { obligationId: { in: obIds } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'obligation', entityId: { in: obIds } } });
  await prisma.obligation.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.evcVisit.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.document.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.stageHistory.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'application', entityId: { in: created } } });
  await prisma.application.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

// Runs a list of [asOf, expected] and checks one alert per step, none on a second run
async function walk(ob, plan) {
  let total = (await notes(ob)).length; // walk may be called again on the same obligation
  for (const [asOf, expected] of plan) {
    const res = await run(asOf, [ob.id]);
    if (!expected) {
      expect(res.fired, `asOf ${asOf} should fire nothing`).toBe(0);
    } else {
      const [state, level, userId] = expected;
      expect(res.fired, `asOf ${asOf} should fire one step`).toBe(1);
      total += 1;
      const now = await reload(ob);
      expect(now.state).toBe(state);
      expect(now.lastAlertLevel).toBe(level);
      const all = await notes(ob);
      expect(all).toHaveLength(total);
      expect(all[all.length - 1]).toMatchObject({ userId, channel: 'IN_APP' });
    }
    expect((await run(asOf, [ob.id])).fired, `second run on ${asOf}`).toBe(0); // idempotent
    expect(await notes(ob)).toHaveLength(total);
  }
  return total;
}

describe('daily check: STAGE ladder', () => {
  it('moves one obligation along the whole ladder, one alert per step', async () => {
    const ob = await mkOb('STAGE', DUE);
    const total = await walk(ob, [
      ['2027-03-05', null], // 3 working days left: too early
      ['2027-03-08', ['REMINDER_SENT', 1, officer1.id]],
      ['2027-03-09', null],
      ['2027-03-10', ['DUE_TODAY', 2, officer1.id]],
      ['2027-03-11', ['OVERDUE', 3, officer1.id]],
      ['2027-03-12', null],
      ['2027-03-15', ['ESCALATED', 4, owners.SUPERVISOR]],
      ['2027-03-17', null],
      ['2027-03-19', ['REPORTED', 5, owners.HEAD_OFFICE]],
    ]);
    expect(total).toBe(5);
    expect(await audits(ob)).toBe(5); // one audit row per transition
    expect(await prisma.auditLog.count({ where: { entity: 'obligation', entityId: ob.id, action: 'ALERT_ESCALATED' } })).toBe(1);
  });

  it('a far asOf fires only the latest step', async () => {
    const ob = await mkOb('STAGE', DUE);
    const res = await run('2027-03-19', [ob.id]);
    expect(res.fired).toBe(1);
    expect(await reload(ob)).toMatchObject({ state: 'REPORTED', lastAlertLevel: 5 });
    expect(await notes(ob)).toHaveLength(1);
  });

  it('does nothing too early, and ignores DONE obligations', async () => {
    const early = await mkOb('STAGE', DUE);
    const done = await mkOb('STAGE', DUE, { state: 'DONE', closedOn: d('2027-03-01') });
    const res = await run('2027-03-01', [early.id, done.id]);
    expect(res).toMatchObject({ checked: 1, fired: 0 });
    expect(await reload(early)).toMatchObject({ state: 'OPEN', lastAlertLevel: 0 });
    const late = await run('2027-03-19', [early.id, done.id]);
    expect(late.checked).toBe(1);
    expect(await reload(done)).toMatchObject({ state: 'DONE', lastAlertLevel: 0 });
  });
});

describe('daily check: EVC', () => {
  it('tells the 7, 3 and 1 day reminders apart and makes a late visit OVERDUE (visit stays PLANNED)', async () => {
    const visit = await prisma.evcVisit.create({ data: { applicationId: file.id, plannedDate: d(DUE) } });
    const ob = await mkOb('EVC', DUE, { refId: visit.id });
    await walk(ob, [
      ['2027-03-01', ['REMINDER_SENT', 1, officer1.id]], // 7 working days before
      ['2027-03-05', ['REMINDER_SENT', 2, officer1.id]], // 3 before
      ['2027-03-09', ['REMINDER_SENT', 3, officer1.id]], // 1 before
      ['2027-03-10', ['DUE_TODAY', 4, officer1.id]],
      ['2027-03-11', ['OVERDUE', 5, officer1.id]],
    ]);
    expect((await prisma.evcVisit.findUnique({ where: { id: visit.id } })).status).toBe('PLANNED');
    await walk(ob, [
      ['2027-03-15', ['ESCALATED', 6, owners.SUPERVISOR]],
      ['2027-03-19', ['REPORTED', 7, owners.HEAD_OFFICE]],
    ]);
  });
});

describe('daily check: UNDERTAKING', () => {
  it('follows the ladder, and a reopened obligation starts again', async () => {
    const ob = await mkOb('UNDERTAKING', DUE);
    await walk(ob, [
      ['2027-03-03', ['REMINDER_SENT', 1, officer1.id]], // 5 working days before
      ['2027-03-10', ['DUE_TODAY', 2, officer1.id]],
      ['2027-03-11', ['OVERDUE', 3, officer1.id]],
      ['2027-03-15', ['ESCALATED', 4, owners.SUPERVISOR]],
    ]);
    // what a rejected proof does (Stage 6): back to OPEN, new date, level 0
    await prisma.obligation.update({
      where: { id: ob.id },
      data: { state: 'OPEN', dueDate: d('2027-04-14'), lastAlertLevel: 0, closedOn: null },
    });
    const res = await run('2027-04-07', [ob.id]); // 5 working days before 14 Apr
    expect(res.fired).toBe(1);
    expect(await reload(ob)).toMatchObject({ state: 'REMINDER_SENT', lastAlertLevel: 1 });
  });
});

describe('daily check: DOCUMENT', () => {
  const V = '2027-06-10'; // valid until

  it('a lease 60 days ahead gets its reminder now; an expired lease escalates', async () => {
    const doc = await prisma.document.create({
      data: { applicationId: file.id, docType: 'Lease deed', validUntil: d(V) },
    });
    const ob = await mkOb('DOCUMENT', V, { refId: doc.id });
    const docStatus = async () => (await prisma.document.findUnique({ where: { id: doc.id } })).status;

    await walk(ob, [
      [addIso(V, -100), null],
      [addIso(V, -60), ['REMINDER_SENT', 2, officer1.id]], // the 90-day reminder is skipped, not sent late
      [addIso(V, -30), ['REMINDER_SENT', 3, officer1.id]],
    ]);
    expect(await docStatus()).toBe('VALID');
    await walk(ob, [[V, ['DUE_TODAY', 4, officer1.id]]]);
    expect(await docStatus()).toBe('VALID'); // valid until the end of its last day
    await walk(ob, [
      [addIso(V, 1), ['OVERDUE', 5, officer1.id]],
      [addIso(V, 3), ['ESCALATED', 6, owners.SUPERVISOR]],
      [addIso(V, 7), ['REPORTED', 7, owners.HEAD_OFFICE]],
    ]);
    expect(await docStatus()).toBe('EXPIRED');
    expect((await notes(ob))[0].body).toContain('Lease deed');
  });
});

describe('daily check: failures roll back one obligation only', () => {
  it('a failing audit write leaves that obligation untouched and the next one is still processed', async () => {
    const ob1 = await mkOb('STAGE', DUE);
    const ob2 = await mkOb('STAGE', DUE);
    const spy = vi.spyOn(audit, 'logAction').mockRejectedValueOnce(new Error('boom'));
    const res = await run(DUE, [ob1.id, ob2.id]);
    spy.mockRestore();

    expect(res).toMatchObject({ fired: 1, failed: 1 });
    expect(res.failures[0].obligationId).toBe(ob1.id);
    expect(await reload(ob1)).toMatchObject({ state: 'OPEN', lastAlertLevel: 0 });
    expect(await notes(ob1)).toHaveLength(0);
    expect(await audits(ob1)).toBe(0);
    expect((await reload(ob2)).lastAlertLevel).toBe(2);

    // the next run picks up the one that failed
    expect((await run(DUE, [ob1.id, ob2.id])).fired).toBe(1);
    expect((await reload(ob1)).lastAlertLevel).toBe(2);
  });

  it('a failing recipient lookup rolls back the state change too', async () => {
    const ob = await mkOb('STAGE', DUE);
    const spy = vi.spyOn(scheduleService, 'resolveOwners').mockRejectedValueOnce(new Error('boom'));
    const res = await run(DUE, [ob.id]);
    spy.mockRestore();
    expect(res.failed).toBe(1);
    expect(await reload(ob)).toMatchObject({ state: 'OPEN', lastAlertLevel: 0 });
    expect(await notes(ob)).toHaveLength(0);
  });
});