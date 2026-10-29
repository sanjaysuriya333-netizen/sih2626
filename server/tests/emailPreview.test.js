import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import request from 'supertest';

const require = createRequire(import.meta.url);
const app = require('../src/app.js');
const prisma = require('../src/utils/prisma.js');

const TAG = 'TEST-MAIL';
let head, officer, officerRow;

async function agentFor(email) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: 'Demo@1234' });
  return agent;
}

beforeAll(async () => {
  [head, officer] = await Promise.all([agentFor('head1@demo.test'), agentFor('officer1@demo.test')]);
  officerRow = await prisma.user.findUnique({ where: { email: 'officer1@demo.test' } });
});

afterAll(async () => {
  // test cleanup only
  await prisma.notification.deleteMany({ where: { subject: { startsWith: TAG } } });
  await prisma.$disconnect();
});

describe('GET /api/email-preview', () => {
  it('lists EMAIL rows only, with the recipient address, and reports the mail mode', async () => {
    const mail = await prisma.notification.create({
      data: { userId: officerRow.id, channel: 'EMAIL', subject: `${TAG} mail`, body: 'hello' },
    });
    const inApp = await prisma.notification.create({
      data: { userId: officerRow.id, channel: 'IN_APP', subject: `${TAG} app`, body: 'hello', sentOn: new Date() },
    });
    const res = await head.get('/api/email-preview?pageSize=100');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((r) => r.id);
    expect(ids).toContain(mail.id);
    expect(ids).not.toContain(inApp.id);
    const row = res.body.data.find((r) => r.id === mail.id);
    expect(row.to).toEqual({ name: officerRow.name, email: officerRow.email });
    expect(row.sentOn).toBeNull();
    expect(res.body.meta.mode).toBe('preview'); // vitest.config sets MAIL_MODE=preview
  });

  it('is head office only and validates paging', async () => {
    expect((await officer.get('/api/email-preview')).status).toBe(403);
    expect((await request(app).get('/api/email-preview')).status).toBe(401);
    expect((await head.get('/api/email-preview?pageSize=1000')).status).toBe(400);
  });
});