import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';

// Stage 10A end-to-end walk: ONE application on "Scrutiny + EVC" from submission to a lease expiry.
// The alert expected at every step is written in docs/e2e-expected.md and asserted here.
// Due dates come from the real current day, so each step reads the due date from the database and
// picks the asOf day itself (dayWith). Steps depend on each other: if one fails, look at the first failure.
const require = createRequire(import.meta.url);
const app = require('../src/app.js');
const prisma = require('../src/utils/prisma.js');
const scheduleService = require('../src/services/scheduleService.js');
const { runDailyCheck, todayInIst } = require('../src/jobs/dailyCheck.js');
const { computeDaysToDue } = require('../src/services/ladder.js');
const { loadHolidays, addWorkingDays } = require('../src/services/workingDays.js');

// Uploaded test files go to a temp folder, never to the real uploads/ folder
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sih-e2e-'));
const oldDir = process.env.UPLOAD_DIR;
process.env.UPLOAD_DIR = tmp;

const DAY = 24 * 60 * 60 * 1000;
const PDF = Buffer.from('%PDF-1.4\nproof\n');
const iso = (d) => d.toISOString().slice(0, 10);
const SUBJECT = {
  REMINDER_SENT: /^Reminder/,
  DUE_TODAY: /^Due today/,
  OVERDUE: /^Overdue/,
  ESCALATED: /^Escalated/,
  REPORTED: /^Reported/,
};

let officer, sup, head, inst; // logged-in agents
let officer1, instUsers, owners, holidays, today, startMaxNotification;
let fired = 0; // alerts the walk expects in total
const S = {}; // state passed from step to step

const plus = (n) => iso(new Date(today.getTime() + n * DAY));
async function agentFor(email) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: 'Demo@1234' });
  return agent;
}

// The day on which `kind` has exactly n days to due (working days; calendar days for DOCUMENT)
function dayWith(kind, due, n) {
  for (let i = -60; i <= 60; i += 1) {
    const cand = new Date(due.getTime() + i * DAY);
    if (computeDaysToDue(kind, due, cand, holidays) === n) return cand;
  }
  throw new Error(`No day found with ${n} days to due`);
}
const notes = (ob, channel) =>
  prisma.notification.findMany({ where: { obligationId: ob.id, channel }, orderBy: { id: 'asc' } });
const reload = (ob) => prisma.obligation.findUnique({ where: { id: ob.id } });
const currentStageOb = async () => {
  const a = await prisma.application.findUnique({ where: { id: S.app.id } });
  return prisma.obligation.findFirst({ where: { applicationId: a.id, kind: 'STAGE', refId: a.currentStageId } });
};
const stageName = async () =>
  (await officer.get(`/api/applications/${S.app.id}`)).body.data.currentStage.stageName;

// Runs the job for one obligation on the day with n days to due; expects ONE alert (in-app + email)
async function fire(ob, kind, n, [state, level, userId]) {
  const asOf = dayWith(kind, (await reload(ob)).dueDate, n);
  const inBefore = (await notes(ob, 'IN_APP')).length;
  const mailBefore = (await notes(ob, 'EMAIL')).length;
  const res = await runDailyCheck({ asOf, obligationIds: [ob.id] });
  expect(res.fired, `${kind} ${state}: should fire once`).toBe(1);
  fired += 1;
  expect(await reload(ob)).toMatchObject({ state, lastAlertLevel: level });
  const inApp = await notes(ob, 'IN_APP');
  const mail = await notes(ob, 'EMAIL');
  expect(inApp).toHaveLength(inBefore + 1);
  expect(mail).toHaveLength(mailBefore + 1);
  expect(inApp.at(-1).userId).toBe(userId);
  expect(mail.at(-1).userId).toBe(userId);
  expect(inApp.at(-1).subject).toMatch(SUBJECT[state]);
  // idempotent: the same day again sends nothing
  expect((await runDailyCheck({ asOf, obligationIds: [ob.id] })).fired).toBe(0);
  expect(await notes(ob, 'IN_APP')).toHaveLength(inBefore + 1);
}
async function quiet(ob, kind, n) {
  const asOf = dayWith(kind, (await reload(ob)).dueDate, n);
  expect((await runDailyCheck({ asOf, obligationIds: [ob.id] })).fired).toBe(0);
}
const completeStage = (agent, body = {}) => agent.post(`/api/applications/${S.app.id}/stages/complete`).send(body);

beforeAll(async () => {
  [officer, sup, head, inst] = await Promise.all([
    agentFor('officer1@demo.test'),
    agentFor('supervisor1@demo.test'),
    agentFor('head1@demo.test'),
    agentFor('institution1@demo.test'),
  ]);
  officer1 = await prisma.user.findUnique({ where: { email: 'officer1@demo.test' } });
  instUsers = await prisma.user.findMany({ where: { role: 'INSTITUTION', institutionId: 1, active: true } });
  owners = await scheduleService.resolveOwners(prisma, officer1.id);
  holidays = await loadHolidays(prisma);
  today = todayInIst();
  startMaxNotification = (await prisma.notification.aggregate({ _max: { id: true } }))._max.id ?? 0;
});

afterAll(async () => {
  // test cleanup only: the app itself never deletes rows
  if (S.app) {
    const id = S.app.id;
    const obIds = (await prisma.obligation.findMany({ where: { applicationId: id }, select: { id: true } })).map((o) => o.id);
    const ukIds = (await prisma.undertaking.findMany({ where: { applicationId: id }, select: { id: true } })).map((o) => o.id);
    const docIds = (await prisma.document.findMany({ where: { applicationId: id }, select: { id: true } })).map((o) => o.id);
    const proofIds = (
      await prisma.proof.findMany({
        where: { OR: [{ ownerType: 'UNDERTAKING', ownerId: { in: ukIds } }, { ownerType: 'DOCUMENT', ownerId: { in: docIds } }] },
        select: { id: true },
      })
    ).map((o) => o.id);
    await prisma.notification.deleteMany({ where: { OR: [{ obligationId: { in: obIds } }, { id: { gt: startMaxNotification } }] } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entity: 'obligation', entityId: { in: obIds } },
          { entity: 'application', entityId: id },
          { entity: 'undertaking', entityId: { in: ukIds } },
          { entity: 'document', entityId: { in: docIds } },
          { entity: 'proof', entityId: { in: proofIds } },
        ],
      },
    });
    await prisma.proof.deleteMany({ where: { id: { in: proofIds } } });
    await prisma.obligation.deleteMany({ where: { applicationId: id } });
    await prisma.evcVisit.deleteMany({ where: { applicationId: id } });
    await prisma.undertaking.deleteMany({ where: { applicationId: id } });
    await prisma.document.updateMany({ where: { applicationId: id }, data: { replacedById: null } });
    await prisma.document.deleteMany({ where: { applicationId: id } });
    await prisma.stageHistory.deleteMany({ where: { applicationId: id } });
    await prisma.application.deleteMany({ where: { id } });
  }
  process.env.UPLOAD_DIR = oldDir;
  fs.rmSync(tmp, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe('end to end: one application, submission to lease expiry', () => {
  it('1. submission: route, dated stages, no alert yet', async () => {
    const res = await officer
      .post('/api/applications')
      .send({ institutionId: 1, newOrExisting: 'NEW', programmeLevel: 'UG', submittedOn: plus(0) });
    expect(res.status).toBe(201);
    S.app = res.body.data;
    expect(S.app.routeName).toBe('Scrutiny + EVC');
    expect(S.app.stages).toHaveLength(6);
    const all = await prisma.obligation.findMany({ where: { applicationId: S.app.id } });
    expect(all).toHaveLength(6);
    expect(all.every((o) => o.kind === 'STAGE' && o.state === 'OPEN')).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: 'APPLICATION_CREATED', entityId: S.app.id } })).toBe(1);

    // the job looks at the current stage only; 3 working days before it is due nothing fires
    const cur = await currentStageOb();
    const asOf = dayWith('STAGE', cur.dueDate, 3);
    const run = await runDailyCheck({ asOf, obligationIds: all.map((o) => o.id) });
    expect(run).toMatchObject({ checked: 1, fired: 0 });
  });

  it('2. scrutiny stage 1: reminder to the officer, then the stage is completed', async () => {
    const ob = await currentStageOb();
    expect(await stageName()).toBe('Application received');
    await fire(ob, 'STAGE', 2, ['REMINDER_SENT', 1, officer1.id]);
    expect((await completeStage(officer)).status).toBe(200);
    expect((await reload(ob)).state).toBe('DONE');
    expect(await stageName()).toBe('Document scrutiny');
  });

  it('3. scrutiny stage 2 runs late: due today, escalated to the supervisor, reported to head office', async () => {
    const ob = await currentStageOb();
    await fire(ob, 'STAGE', 0, ['DUE_TODAY', 2, officer1.id]);
    await fire(ob, 'STAGE', -3, ['ESCALATED', 4, owners.SUPERVISOR]);
    await fire(ob, 'STAGE', -7, ['REPORTED', 5, owners.HEAD_OFFICE]);
    expect((await completeStage(officer)).status).toBe(200);
    expect((await reload(ob)).state).toBe('DONE');
    expect(await stageName()).toBe('EVC scheduling');
    expect((await prisma.application.findUnique({ where: { id: S.app.id } })).evcReadyOn).not.toBeNull();
  });

  it('4. EVC: queue, schedule, reminders at 7, 3 and 1 days, record the visit', async () => {
    const queue = await officer.get('/api/evc/queue?pageSize=100');
    expect(queue.body.data.map((r) => r.id)).toContain(S.app.id);

    const planned = iso(addWorkingDays(today, 8, holidays)); // clear of the 7-working-day notice rule
    const sched = await officer.post(`/api/evc/${S.app.id}/schedule`).send({ plannedDate: planned });
    expect(sched.status).toBe(201);
    S.visitId = sched.body.data.visit.id;
    expect(await stageName()).toBe('EVC visit');

    const ob = await prisma.obligation.findFirst({ where: { kind: 'EVC', refId: S.visitId } });
    expect(ob).toMatchObject({ state: 'OPEN', lastAlertLevel: 0, ownerId: officer1.id });
    expect(iso(ob.dueDate)).toBe(planned);
    await fire(ob, 'EVC', 7, ['REMINDER_SENT', 1, officer1.id]);
    await fire(ob, 'EVC', 3, ['REMINDER_SENT', 2, officer1.id]);
    await fire(ob, 'EVC', 1, ['REMINDER_SENT', 3, officer1.id]);

    const done = await officer.post(`/api/evc/${S.visitId}/complete`).send({ committeeNotes: 'Visit done, as per application.' });
    expect(done.status).toBe(200);
    expect((await reload(ob)).state).toBe('DONE');
    expect(await stageName()).toBe('EVC report review');
  });

  it('5. report review, then approval by the supervisor (the stage owner is the supervisor)', async () => {
    expect((await completeStage(officer)).status).toBe(200);
    expect(await stageName()).toBe('Approval decision');
    const ob = await currentStageOb();
    expect(ob.ownerId).toBe(owners.SUPERVISOR);
    await fire(ob, 'STAGE', 2, ['REMINDER_SENT', 1, owners.SUPERVISOR]);

    const approved = await completeStage(sup, { decision: 'APPROVED' });
    expect(approved.status).toBe(200);
    const row = await prisma.application.findUnique({ where: { id: S.app.id } });
    expect(row.status).toBe('APPROVED');
    expect(row.closedOn).not.toBeNull();
    expect((await reload(ob)).state).toBe('DONE');
  });

  it('6. undertaking on the approved file: reminder, rejected proof reopens it, accepted proof closes it', async () => {
    const instIds = instUsers.map((u) => u.id);
    const before = (await prisma.notification.aggregate({ _max: { id: true } }))._max.id ?? 0;
    const rec = await officer
      .post(`/api/applications/${S.app.id}/undertakings`)
      .send({ description: 'Appoint two more faculty members', dueDate: plus(14) });
    expect(rec.status).toBe(201);
    S.undertaking = rec.body.data;
    // the institution is told about the promise
    expect(await prisma.notification.count({ where: { id: { gt: before }, userId: { in: instIds } } })).toBe(instUsers.length);

    const ob = await reload({ id: S.undertaking.obligationId });
    expect(ob).toMatchObject({ kind: 'UNDERTAKING', state: 'OPEN', ownerId: officer1.id });
    await fire(ob, 'UNDERTAKING', 5, ['REMINDER_SENT', 1, officer1.id]);

    // proof 1 is rejected: the same obligation reopens with the new date, level 0
    const up1 = await inst.post(`/api/undertakings/${S.undertaking.id}/proofs`).attach('file', PDF, { filename: 'proof1.pdf' });
    expect(up1.status).toBe(201);
    const mark = (await prisma.notification.aggregate({ _max: { id: true } }))._max.id ?? 0;
    const rej = await officer
      .post(`/api/proofs/${up1.body.data.proof.id}/verify`)
      .send({ status: 'REJECTED', remarks: 'Scan is unreadable', newDueDate: plus(21) });
    expect(rej.status).toBe(200);
    const reopened = await reload(ob);
    expect(reopened).toMatchObject({ state: 'OPEN', lastAlertLevel: 0, closedOn: null });
    expect(iso(reopened.dueDate)).toBe(plus(21));
    expect(await prisma.notification.count({ where: { id: { gt: mark }, userId: { in: instIds } } })).toBe(instUsers.length);

    // proof 2 is accepted: the obligation closes and the job ignores it
    const up2 = await inst.post(`/api/undertakings/${S.undertaking.id}/proofs`).attach('file', PDF, { filename: 'proof2.pdf' });
    expect(up2.status).toBe(201);
    const acc = await officer.post(`/api/proofs/${up2.body.data.proof.id}/verify`).send({ status: 'ACCEPTED' });
    expect(acc.status).toBe(200);
    expect((await prisma.undertaking.findUnique({ where: { id: S.undertaking.id } })).status).toBe('VERIFIED');
    expect((await reload(ob)).state).toBe('DONE');
    const far = await runDailyCheck({ asOf: new Date(today.getTime() + 90 * DAY), obligationIds: [ob.id] });
    expect(far).toMatchObject({ checked: 0, fired: 0 });
  });

  it('7. lease expiry on the approved file: reminder now, then due, expired, escalated, reported', async () => {
    const res = await inst.post('/api/documents').send({ applicationId: S.app.id, docType: 'Lease deed', validUntil: plus(60) });
    expect(res.status).toBe(201);
    S.doc = res.body.data;
    const ob = await reload({ id: S.doc.obligationId });
    const docStatus = async () => (await prisma.document.findUnique({ where: { id: S.doc.id } })).status;

    // 60 days ahead: only the latest applicable reminder (step 2) is sent, the 90-day one is skipped
    await fire(ob, 'DOCUMENT', 60, ['REMINDER_SENT', 2, officer1.id]);
    await quiet(ob, 'DOCUMENT', 45); // nothing between the reminders
    await fire(ob, 'DOCUMENT', 0, ['DUE_TODAY', 4, officer1.id]);
    expect(await docStatus()).toBe('VALID'); // valid through its last day
    await fire(ob, 'DOCUMENT', -1, ['OVERDUE', 5, officer1.id]);
    expect(await docStatus()).toBe('EXPIRED');
    await fire(ob, 'DOCUMENT', -3, ['ESCALATED', 6, owners.SUPERVISOR]);
    await fire(ob, 'DOCUMENT', -7, ['REPORTED', 7, owners.HEAD_OFFICE]);
    expect((await reload(ob)).state).toBe('REPORTED'); // stays open until a renewal is accepted
  });

  it('8. the trail: timeline, audit rows and alert counts match the walk', async () => {
    const detail = await head.get(`/api/applications/${S.app.id}`);
    expect(detail.body.data.status).toBe('APPROVED');
    expect(detail.body.data.timeline).toHaveLength(6);
    expect(detail.body.data.timeline.every((t) => t.state === 'DONE')).toBe(true);

    const rows = await prisma.auditLog.groupBy({
      by: ['action'],
      where: { entity: 'application', entityId: S.app.id },
      _count: true,
    });
    const count = Object.fromEntries(rows.map((r) => [r.action, r._count]));
    expect(count).toMatchObject({ APPLICATION_CREATED: 1, STAGE_COMPLETED: 4, EVC_SCHEDULED: 1, EVC_COMPLETED: 1 });

    const obIds = (await prisma.obligation.findMany({ where: { applicationId: S.app.id }, select: { id: true } })).map((o) => o.id);
    expect(fired).toBe(14);
    expect(await prisma.auditLog.count({ where: { entity: 'obligation', entityId: { in: obIds }, action: { startsWith: 'ALERT_' } } })).toBe(14);
    expect(await prisma.notification.count({ where: { obligationId: { in: obIds }, channel: 'EMAIL' } })).toBe(14);
    expect(await prisma.auditLog.count({ where: { action: 'UNDERTAKING_RECORDED', entityId: S.undertaking.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'PROOF_UPLOADED', entity: 'proof' } })).toBeGreaterThanOrEqual(2);
    expect(await prisma.auditLog.count({ where: { action: 'DOCUMENT_CREATED', entityId: S.doc.id } })).toBe(1);
  });
});