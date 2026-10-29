import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'node:module';
import request from 'supertest';

const require = createRequire(import.meta.url);
const app = require('../src/app.js');
const prisma = require('../src/utils/prisma.js');
const audit = require('../src/services/audit.js');
const { runDailyCheck } = require('../src/jobs/dailyCheck.js');
const { toCsv } = require('../src/utils/csvWrite.js');

const created = [];
let head, officer, inst, officerRow, file, ob;

async function agentFor(email) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: 'Demo@1234' });
  return agent;
}
const report = (agent, path) => agent.get(`/api/reports${path}`);
const summary = async () => (await head.get('/api/dashboard/summary')).body.data;

beforeAll(async () => {
  [head, officer, inst] = await Promise.all([
    agentFor('head1@demo.test'),
    agentFor('officer1@demo.test'),
    agentFor('institution1@demo.test'),
  ]);
  officerRow = await prisma.user.findUnique({ where: { email: 'officer1@demo.test' } });
  const res = await officer.post('/api/applications').send({ institutionId: 1, newOrExisting: 'NEW', programmeLevel: 'UG' });
  expect(res.status).toBe(201);
  file = res.body.data;
  created.push(file.id);
  ob = await prisma.obligation.findFirst({
    where: { applicationId: file.id, kind: 'STAGE', refId: file.currentStageId },
  });
});

afterAll(async () => {
  // test cleanup only: the app itself never deletes rows
  const obs = await prisma.obligation.findMany({ where: { applicationId: { in: created } }, select: { id: true } });
  const obIds = obs.map((o) => o.id);
  await prisma.notification.deleteMany({ where: { obligationId: { in: obIds } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'obligation', entityId: { in: obIds } } });
  await prisma.auditLog.deleteMany({ where: { action: 'REPORT_EXPORTED' } });
  await prisma.obligation.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.stageHistory.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'application', entityId: { in: created } } });
  await prisma.application.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe('pending report', () => {
  it('head office total equals the in-progress count; an officer only gets their own files', async () => {
    const res = await report(head, '/pending?pageSize=100');
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe((await summary()).inProgress);
    expect(res.body.meta.columns[0]).toMatchObject({ key: 'appCode' });
    const dates = res.body.data.map((r) => r.dueDate).filter(Boolean);
    expect([...dates].sort()).toEqual(dates); // earliest due date first

    const mine = await report(officer, '/pending?pageSize=100');
    expect(mine.body.meta.total).toBe(
      await prisma.application.count({ where: { status: 'IN_PROGRESS', assignedOfficerId: officerRow.id } }),
    );
    for (const r of mine.body.data) expect(r.officer).toBe(officerRow.name);
  });

  it('region and stage filters equal the dashboard groups', async () => {
    const regions = (await head.get('/api/dashboard/breakdown?by=region')).body.data;
    const byRegion = await report(head, `/pending?region=${encodeURIComponent(regions[0].label)}`);
    expect(byRegion.body.meta.total).toBe(regions[0].total);
    const stages = (await head.get('/api/dashboard/breakdown?by=stage')).body.data;
    const byStage = await report(head, `/pending?stage=${encodeURIComponent(stages[0].label)}`);
    expect(byStage.body.meta.total).toBe(stages[0].total);
  });
});

describe('overdue report', () => {
  it('equals the dashboard overdue + escalated + reported, most overdue first', async () => {
    const s = await summary();
    const res = await report(head, '/overdue?pageSize=100');
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(s.overdue + s.escalated + s.reported);
    for (const r of res.body.data) expect(['OVERDUE', 'ESCALATED', 'REPORTED']).toContain(r.state);
    const days = res.body.data.map((r) => r.daysOverdue);
    expect([...days].sort((a, b) => b - a)).toEqual(days);
  });
});

describe('compliance report', () => {
  it('lists stage history, audit rows and alerts of a file', async () => {
    // make the file's stage overdue in 2027 and run the job for it only
    await prisma.obligation.update({ where: { id: ob.id }, data: { dueDate: new Date('2027-03-10T00:00:00Z') } });
    expect((await runDailyCheck({ asOf: '2027-03-11', obligationIds: [ob.id] })).fired).toBe(1);

    const res = await report(officer, '/compliance?pageSize=100');
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    const rows = res.body.data.filter((r) => r.appCode === file.appCode);
    expect(rows.find((r) => r.type === 'STAGE' && r.event.startsWith('Entered stage'))).toBeTruthy();
    const created1 = rows.find((r) => r.type === 'AUDIT' && r.event === 'APPLICATION_CREATED');
    expect(created1.by).toBe(officerRow.name);
    const alert = rows.find((r) => r.event === 'ALERT_OVERDUE');
    expect(alert).toMatchObject({ type: 'ALERT', by: 'System' });
    expect(alert.detail).toContain(`obligation #${ob.id}`);
    for (const r of res.body.data) expect(r.appCode).toBeTruthy();
  });
});

describe('CSV export', () => {
  it('downloads a CSV with a header and one line per row, and writes one audit row', async () => {
    const before = await prisma.auditLog.count({ where: { action: 'REPORT_EXPORTED' } });
    const total = (await report(officer, '/pending')).body.meta.total;
    const res = await report(officer, '/pending/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    const lines = res.text.replace(/^\uFEFF/, '').trimEnd().split('\r\n');
    expect(lines[0]).toBe('Application,Institution,Region,Route,Current stage,Officer,Submitted,Due date,Days to due,State');
    expect(lines).toHaveLength(total + 1);

    const rows = await prisma.auditLog.findMany({ where: { action: 'REPORT_EXPORTED' } });
    expect(rows).toHaveLength(before + 1);
    expect(rows[rows.length - 1]).toMatchObject({ userId: officerRow.id, entity: 'report' });
    expect(rows[rows.length - 1].afterJson).toMatchObject({ report: 'pending', rows: total });
  });

  it('a failing audit write sends no file', async () => {
    const spy = vi.spyOn(audit, 'logAction').mockRejectedValueOnce(new Error('boom'));
    const res = await report(officer, '/pending/export');
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.headers['content-type']).not.toContain('text/csv');
  });

  it('escapes quotes and commas, and blocks spreadsheet formulas', () => {
    const csv = toCsv(
      [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }],
      [{ a: '=SUM(1)', b: 'say "hi", ok' }, { a: null, b: 5 }],
    );
    expect(csv).toBe('\uFEFFA,B\r\n\'=SUM(1),"say ""hi"", ok"\r\n,5\r\n');
  });
});

describe('access and validation', () => {
  it('institutions get 403, anonymous users 401, bad input 400', async () => {
    expect((await report(inst, '/pending')).status).toBe(403);
    expect((await report(inst, '/pending/export')).status).toBe(403);
    expect((await request(app).get('/api/reports/pending')).status).toBe(401);
    expect((await request(app).get('/api/reports/pending/export')).status).toBe(401);
    expect((await report(head, '/nope')).status).toBe(400);
    expect((await report(head, '/pending?dueFrom=2026-13-40')).status).toBe(400);
    expect((await report(head, '/pending?dueFrom=2026-12-10&dueTo=2026-12-01')).status).toBe(400);
    expect((await report(head, '/pending?pageSize=1000')).status).toBe(400);
    expect((await report(head, '/pending?region=')).status).toBe(200); // empty filter = not set
  });
});