import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import request from 'supertest';

const require = createRequire(import.meta.url);
const app = require('../src/app.js');
const prisma = require('../src/utils/prisma.js');

const TAG = 'TEST-NOTIF';
let officer, sup, officerRow, supRow;

async function agentFor(email) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: 'Demo@1234' });
  return agent;
}
const mk = (userId, over = {}) =>
  prisma.notification.create({
    data: { userId, channel: 'IN_APP', subject: `${TAG} one`, body: 'b', sentOn: new Date(), ...over },
  });
const unread = async (agent) => (await agent.get('/api/notifications/unread-count')).body.data.unread;

beforeAll(async () => {
  [officer, sup] = await Promise.all([agentFor('officer1@demo.test'), agentFor('supervisor1@demo.test')]);
  officerRow = await prisma.user.findUnique({ where: { email: 'officer1@demo.test' } });
  supRow = await prisma.user.findUnique({ where: { email: 'supervisor1@demo.test' } });
});

afterAll(async () => {
  // test cleanup only: the app itself never deletes rows
  await prisma.notification.deleteMany({ where: { subject: { startsWith: TAG } } });
  await prisma.$disconnect();
});

describe('notifications API', () => {
  it('lists only own IN_APP rows, newest first', async () => {
    const a = await mk(officerRow.id, { subject: `${TAG} a` });
    const b = await mk(officerRow.id, { subject: `${TAG} b` });
    const mail = await mk(officerRow.id, { channel: 'EMAIL', subject: `${TAG} mail`, sentOn: null });
    const theirs = await mk(supRow.id, { subject: `${TAG} theirs` });

    const res = await officer.get('/api/notifications?pageSize=100');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((r) => r.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    expect(ids).not.toContain(mail.id); // EMAIL rows are not in the bell
    expect(ids).not.toContain(theirs.id); // someone else's row
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 100 });
    expect(res.body.data[0]).toHaveProperty('appCode');
  });

  it('counts and filters unread, and marks one row read (safe to repeat)', async () => {
    const before = await unread(officer);
    const n = await mk(officerRow.id);
    expect(await unread(officer)).toBe(before + 1);
    const listed = (await officer.get('/api/notifications?unread=true&pageSize=100')).body.data.map((r) => r.id);
    expect(listed).toContain(n.id);

    const first = await officer.post(`/api/notifications/${n.id}/read`);
    expect(first.status).toBe(200);
    expect(first.body.data.readOn).toBeTruthy();
    expect(await unread(officer)).toBe(before);
    const again = await officer.post(`/api/notifications/${n.id}/read`);
    expect(again.body.data.readOn).toBe(first.body.data.readOn); // keeps the first read time
    const after = (await officer.get('/api/notifications?unread=true&pageSize=100')).body.data.map((r) => r.id);
    expect(after).not.toContain(n.id);
  });

  it('cannot read someone else\'s notification (404) and leaves it unread', async () => {
    const theirs = await mk(supRow.id);
    expect((await officer.post(`/api/notifications/${theirs.id}/read`)).status).toBe(404);
    expect((await prisma.notification.findUnique({ where: { id: theirs.id } })).readOn).toBeNull();
  });

  it('read-all only touches the caller\'s rows', async () => {
    await mk(officerRow.id);
    const theirs = await mk(supRow.id);
    const res = await officer.post('/api/notifications/read-all');
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBeGreaterThanOrEqual(1);
    expect(await unread(officer)).toBe(0);
    expect((await prisma.notification.findUnique({ where: { id: theirs.id } })).readOn).toBeNull();
    expect(await unread(sup)).toBeGreaterThanOrEqual(1);
  });

  it('validates input and requires login', async () => {
    expect((await officer.get('/api/notifications?pageSize=1000')).status).toBe(400);
    expect((await officer.get('/api/notifications?unread=maybe')).status).toBe(400);
    expect((await officer.post('/api/notifications/abc/read')).status).toBe(400);
    expect((await request(app).get('/api/notifications')).status).toBe(401);
    expect((await request(app).get('/api/notifications/unread-count')).status).toBe(401);
    expect((await request(app).post('/api/notifications/read-all')).status).toBe(401);
  });
});