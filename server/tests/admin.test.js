import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import request from 'supertest';

const require = createRequire(import.meta.url);
const app = require('../src/app.js');
const prisma = require('../src/utils/prisma.js');
const cron = require('node-cron');
const { runDailyCheckAudited } = require('../src/jobs/dailyCheck.js');
const { DAILY_CRON, TIMEZONE, startScheduler } = require('../src/jobs/scheduler.js');

const DAY = 24 * 60 * 60 * 1000;
const startedAt = new Date();
const farPast = new Date(Date.now() - 400 * DAY).toISOString().slice(0, 10);

async function agentFor(email) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: 'Demo@1234' });
  return agent;
}

afterAll(async () => {
  // test cleanup only: the app itself never deletes rows
  await prisma.auditLog.deleteMany({ where: { action: 'DAILY_CHECK_RUN', at: { gte: startedAt } } });
  await prisma.$disconnect();
});

describe('POST /api/admin/run-daily-check', () => {
  it('only head office may run it', async () => {
    const url = `/api/admin/run-daily-check?asOf=${farPast}`;
    expect((await request(app).post(url)).status).toBe(401);
    for (const email of ['officer1@demo.test', 'supervisor1@demo.test', 'institution1@demo.test']) {
      expect((await (await agentFor(email)).post(url)).status).toBe(403);
    }
  });

  it('rejects a bad asOf', async () => {
    const head = await agentFor('head1@demo.test');
    expect((await head.post('/api/admin/run-daily-check?asOf=2026-02-30')).status).toBe(400);
    expect((await head.post('/api/admin/run-daily-check?asOf=nope')).status).toBe(400);
  });

  it('runs for a simulated date, fires nothing in the far past and writes one summary audit row', async () => {
    const head = await agentFor('head1@demo.test');
    const headRow = await prisma.user.findUnique({ where: { email: 'head1@demo.test' } });
    const res = await head.post(`/api/admin/run-daily-check?asOf=${farPast}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ asOf: farPast, fired: 0, failed: 0, transitions: [] });
    expect(res.body.data.checked).toBeGreaterThan(0);

    const rows = await prisma.auditLog.findMany({ where: { action: 'DAILY_CHECK_RUN', at: { gte: startedAt } } });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(headRow.id);
    expect(rows[0].afterJson.asOf).toBe(farPast);
  });
});

describe('runDailyCheckAudited and the scheduler', () => {
  it('writes a summary audit row with no user for a cron-style run', async () => {
    const before = await prisma.auditLog.count({ where: { action: 'DAILY_CHECK_RUN', userId: null } });
    const r = await runDailyCheckAudited({ obligationIds: [] });
    expect(r.checked).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'DAILY_CHECK_RUN', userId: null } })).toBe(before + 1);
  });

  it('is scheduled for 06:00 IST with a valid expression', () => {
    expect(DAILY_CRON).toBe('0 6 * * *');
    expect(TIMEZONE).toBe('Asia/Kolkata');
    expect(cron.validate(DAILY_CRON)).toBe(true);
  });

  it('does not start when DISABLE_CRON is true', () => {
    const old = process.env.DISABLE_CRON;
    process.env.DISABLE_CRON = 'true';
    expect(startScheduler()).toBeNull();
    process.env.DISABLE_CRON = old;
  });
});