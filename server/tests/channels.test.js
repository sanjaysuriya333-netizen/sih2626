import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { createRequire } from 'node:module';
import request from 'supertest';

const require = createRequire(import.meta.url);
const app = require('../src/app.js');
const prisma = require('../src/utils/prisma.js');
const audit = require('../src/services/audit.js');
const notifyService = require('../src/services/notifyService.js');
const channels = require('../src/channels');
const emailChannel = require('../src/channels/emailChannel.js');
const smsChannel = require('../src/channels/smsChannel.js');
const { runDailyCheck } = require('../src/jobs/dailyCheck.js');

const d = (iso) => new Date(`${iso}T00:00:00Z`);
const DUE = '2027-03-10';
const todayIso = new Date().toISOString().slice(0, 10);
const created = [];
let file, officer1, savedMode;

const mkOb = () =>
  prisma.obligation.create({
    data: { kind: 'STAGE', applicationId: file.id, ownerId: officer1.id, dueDate: d(DUE) },
  });
const rows = (ob, channel) =>
  prisma.notification.findMany({ where: { obligationId: ob.id, channel }, orderBy: { id: 'asc' } });
const fakeTransport = () => ({ sendMail: vi.fn(async () => ({})) });

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
});

beforeEach(() => {
  savedMode = process.env.MAIL_MODE;
});

afterEach(() => {
  process.env.MAIL_MODE = savedMode;
  emailChannel.setTransport(null);
  vi.restoreAllMocks();
});

afterAll(async () => {
  // test cleanup only: the app itself never deletes rows
  const obs = await prisma.obligation.findMany({ where: { applicationId: { in: created } }, select: { id: true } });
  const obIds = obs.map((o) => o.id);
  await prisma.notification.deleteMany({ where: { obligationId: { in: obIds } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'obligation', entityId: { in: obIds } } });
  await prisma.obligation.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.stageHistory.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'application', entityId: { in: created } } });
  await prisma.application.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe('adapters', () => {
  it('InAppChannel writes a sent notification row', async () => {
    const ob = await mkOb();
    await channels.send('IN_APP', { id: officer1.id }, { subject: 'S', body: 'B', obligationId: ob.id }, { db: prisma });
    const [row] = await rows(ob, 'IN_APP');
    expect(row).toMatchObject({ userId: officer1.id, subject: 'S', body: 'B' });
    expect(row.sentOn).not.toBeNull();
  });

  it('EmailChannel sends through the transport, and skips SMTP in preview mode', async () => {
    const t = fakeTransport();
    emailChannel.setTransport(t);
    process.env.MAIL_MODE = 'smtp';
    await channels.send('EMAIL', { id: 1, email: 'a@b.test' }, { subject: 'S', body: 'B' });
    expect(t.sendMail).toHaveBeenCalledTimes(1);
    expect(t.sendMail.mock.calls[0][0]).toMatchObject({ to: 'a@b.test', subject: 'S', text: 'B' });

    process.env.MAIL_MODE = 'preview';
    await channels.send('EMAIL', { id: 1, email: 'a@b.test' }, { subject: 'S', body: 'B' });
    expect(t.sendMail).toHaveBeenCalledTimes(1); // nothing new
  });

  it('EmailChannel fails clearly without an address or SMTP settings', async () => {
    process.env.MAIL_MODE = 'smtp';
    await expect(channels.send('EMAIL', { id: 1, email: null }, { subject: 'S', body: 'B' })).rejects.toThrow(/no email/);
    const oldHost = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    await expect(channels.send('EMAIL', { id: 1, email: 'a@b.test' }, { subject: 'S', body: 'B' })).rejects.toThrow(/SMTP_HOST/);
    if (oldHost !== undefined) process.env.SMTP_HOST = oldHost;
  });

  it('SmsChannel stub logs and an unknown provider fails', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await channels.send('SMS', { id: 7 }, { subject: 'S', body: 'B' });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain('[sms stub]');
    process.env.SMS_PROVIDER = 'nope';
    await expect(smsChannel.send({ id: 7 }, { subject: 'S', body: 'B' })).rejects.toThrow(/Unknown SMS_PROVIDER/);
    process.env.SMS_PROVIDER = 'stub';
  });

  it('an unknown channel is rejected', async () => {
    await expect(channels.send('FAX', { id: 1 }, {})).rejects.toThrow(/Unknown channel/);
  });
});

describe('sendAlert and dispatchPending', () => {
  it('sendAlert sends nothing by itself; dispatchPending sends once and sets sent_on', async () => {
    const t = fakeTransport();
    emailChannel.setTransport(t);
    process.env.MAIL_MODE = 'smtp';
    const ob = await mkOb();
    const n = await notifyService.sendAlert(prisma, {
      deliveries: [{ userId: officer1.id, channel: 'IN_APP' }, { userId: officer1.id, channel: 'EMAIL' }],
      subject: 'Hello',
      body: 'World',
      obligationId: ob.id,
    });
    expect(n).toBe(2);
    expect(t.sendMail).not.toHaveBeenCalled();
    expect((await rows(ob, 'IN_APP'))[0].sentOn).not.toBeNull();
    expect((await rows(ob, 'EMAIL'))[0].sentOn).toBeNull();

    expect(await notifyService.dispatchPending(prisma, { obligationId: ob.id })).toEqual({ sent: 1, failed: 0 });
    expect(t.sendMail).toHaveBeenCalledTimes(1);
    expect(t.sendMail.mock.calls[0][0].to).toBe(officer1.email);
    expect((await rows(ob, 'EMAIL'))[0].sentOn).not.toBeNull();

    expect(await notifyService.dispatchPending(prisma, { obligationId: ob.id })).toEqual({ sent: 0, failed: 0 });
    expect(t.sendMail).toHaveBeenCalledTimes(1);
  });

  it('a failed send leaves sent_on null and the next dispatch retries it', async () => {
    const t = fakeTransport();
    t.sendMail.mockRejectedValueOnce(new Error('smtp down'));
    emailChannel.setTransport(t);
    process.env.MAIL_MODE = 'smtp';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ob = await mkOb();
    await notifyService.sendAlert(prisma, {
      deliveries: [{ userId: officer1.id, channel: 'EMAIL' }],
      subject: 'Hello',
      body: 'World',
      obligationId: ob.id,
    });
    expect(await notifyService.dispatchPending(prisma, { obligationId: ob.id })).toEqual({ sent: 0, failed: 1 });
    expect((await rows(ob, 'EMAIL'))[0].sentOn).toBeNull();
    expect(await notifyService.dispatchPending(prisma, { obligationId: ob.id })).toEqual({ sent: 1, failed: 0 });
    expect((await rows(ob, 'EMAIL'))[0].sentOn).not.toBeNull();
  });
});

describe('daily check with channels', () => {
  it('sends the right alert once, in-app and by email, and nothing on a second run', async () => {
    const t = fakeTransport();
    emailChannel.setTransport(t);
    process.env.MAIL_MODE = 'smtp';
    const ob = await mkOb();
    const res = await runDailyCheck({ asOf: DUE, obligationIds: [ob.id] });
    expect(res.fired).toBe(1);
    expect(await rows(ob, 'IN_APP')).toHaveLength(1);
    expect(await rows(ob, 'EMAIL')).toHaveLength(1);
    expect(t.sendMail).toHaveBeenCalledTimes(1);
    expect(t.sendMail.mock.calls[0][0]).toMatchObject({ to: officer1.email });
    expect(t.sendMail.mock.calls[0][0].subject).toContain('Due today');

    expect((await runDailyCheck({ asOf: DUE, obligationIds: [ob.id] })).fired).toBe(0);
    expect(t.sendMail).toHaveBeenCalledTimes(1);
  });

  it('a rolled-back transition sends no email', async () => {
    const t = fakeTransport();
    emailChannel.setTransport(t);
    process.env.MAIL_MODE = 'smtp';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ob = await mkOb();
    vi.spyOn(audit, 'logAction').mockRejectedValueOnce(new Error('boom'));
    const res = await runDailyCheck({ asOf: DUE, obligationIds: [ob.id] });
    expect(res.failed).toBe(1);
    expect(t.sendMail).not.toHaveBeenCalled();
    expect(await rows(ob, 'EMAIL')).toHaveLength(0);
    expect(await rows(ob, 'IN_APP')).toHaveLength(0);
  });
});