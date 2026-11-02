import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import request from 'supertest';
import express from 'express';

const require = createRequire(import.meta.url);
const app = require('../src/app.js');
const prisma = require('../src/utils/prisma.js');
const { checkConfig, findProblems } = require('../src/utils/checkConfig.js');
const { validatePassword } = require('../src/utils/password.js');
const { cookieOptions } = require('../src/controllers/authController.js');
const { userLimiter } = require('../src/middleware/rateLimit.js');

const good = { NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), CLIENT_ORIGIN: 'https://a.app', DATABASE_URL: 'postgres://x' };

describe('startup config check', () => {
  it('refuses the default or a short secret in production', () => {
    expect(() => checkConfig({ ...good, JWT_SECRET: 'change_me' })).toThrow(/JWT_SECRET/);
    expect(() => checkConfig({ ...good, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(() => checkConfig({ ...good, CLIENT_ORIGIN: '' })).toThrow(/CLIENT_ORIGIN/);
    expect(() => checkConfig({ ...good, COOKIE_SAMESITE: 'maybe' })).toThrow(/COOKIE_SAMESITE/);
  });
  it('accepts a good production config, and does not check development', () => {
    expect(() => checkConfig(good)).not.toThrow();
    expect(findProblems(good)).toEqual([]);
    expect(() => checkConfig({ NODE_ENV: 'development', JWT_SECRET: 'change_me' })).not.toThrow();
  });
});

describe('passwords', () => {
  it('enforces the minimum rules and accepts the demo password', () => {
    expect(validatePassword('Demo@1234')).toBeNull();
    expect(validatePassword('short1')).not.toBeNull();
    expect(validatePassword('onlyletters')).not.toBeNull();
    expect(validatePassword('12345678')).not.toBeNull();
    expect(validatePassword(undefined)).not.toBeNull();
  });
  it('every stored hash is bcrypt with cost 10 or more', async () => {
    const users = await prisma.user.findMany({ select: { passwordHash: true } });
    expect(users.length).toBeGreaterThan(0);
    for (const u of users) {
      expect(u.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
      expect(Number(u.passwordHash.split('$')[2])).toBeGreaterThanOrEqual(10);
    }
  });
});

describe('session cookie', () => {
  const old = { ...process.env };
  afterEach(() => {
    process.env.NODE_ENV = old.NODE_ENV;
    if (old.COOKIE_SAMESITE === undefined) delete process.env.COOKIE_SAMESITE;
    else process.env.COOKIE_SAMESITE = old.COOKIE_SAMESITE;
  });

  it('login sets an HTTP-only, same-site cookie that expires in about an hour', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'officer1@demo.test', password: 'Demo@1234' });
    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('token='));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const expires = new Date(/Expires=([^;]+)/i.exec(cookie)[1]).getTime();
    expect(expires - Date.now()).toBeGreaterThan(55 * 60 * 1000);
    expect(expires - Date.now()).toBeLessThan(65 * 60 * 1000);
  });
  it('is secure in production, and SameSite=None forces secure', () => {
    process.env.NODE_ENV = 'production';
    expect(cookieOptions()).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax' });
    process.env.NODE_ENV = 'test';
    process.env.COOKIE_SAMESITE = 'none';
    expect(cookieOptions()).toMatchObject({ secure: true, sameSite: 'none' });
  });
  it('logout clears the cookie', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.headers['set-cookie'].find((c) => c.startsWith('token='))).toMatch(/token=;/);
  });
  it('a token signed with alg none is rejected', async () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ id: 1 })}.`;
    const res = await request(app).get('/api/auth/me').set('Cookie', `token=${forged}`);
    expect(res.status).toBe(401);
  });
});

describe('access and limits', () => {
  it('reports and dashboard need a login, and reports are staff only', async () => {
    expect((await request(app).get('/api/reports/pending')).status).toBe(401);
    expect((await request(app).get('/api/dashboard/summary')).status).toBe(401);
    const inst = request.agent(app);
    await inst.post('/api/auth/login').send({ email: 'institution1@demo.test', password: 'Demo@1234' });
    expect((await inst.get('/api/reports/pending')).status).toBe(403);
    expect((await inst.get('/api/reports/pending/export')).status).toBe(403);
  });
  it('the user limiter answers 429 in the standard error shape', async () => {
    const small = express();
    small.use((req, res, next) => ((req.user = { id: 1 }), next()));
    small.get('/x', userLimiter({ windowMs: 60000, limit: 2, skipInTests: false }), (req, res) => res.json({ ok: true }));
    expect((await request(small).get('/x')).status).toBe(200);
    expect((await request(small).get('/x')).status).toBe(200);
    const third = await request(small).get('/x');
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');
  });
});
describe('every protected endpoint needs a login', () => {
  const ENDPOINTS = [
    ['post', '/api/applications'], ['get', '/api/applications'], ['get', '/api/applications/filters'],
    ['get', '/api/applications/1'], ['post', '/api/applications/import'],
    ['post', '/api/applications/1/stages/complete'], ['post', '/api/applications/1/undertakings'],
    ['get', '/api/evc/queue'], ['get', '/api/evc'], ['post', '/api/evc/1/schedule'], ['post', '/api/evc/1/complete'],
    ['get', '/api/undertakings'], ['post', '/api/undertakings/1/proofs'],
    ['get', '/api/proofs/1/file'], ['post', '/api/proofs/1/verify'],
    ['post', '/api/documents'], ['get', '/api/documents'], ['post', '/api/documents/1/renew'],
    ['post', '/api/documents/1/renewal-decision'], ['post', '/api/admin/run-daily-check'],
    ['get', '/api/notifications'], ['get', '/api/notifications/unread-count'],
    ['post', '/api/notifications/1/read'], ['post', '/api/notifications/read-all'],
    ['get', '/api/settings'], ['put', '/api/settings/alert-steps/STAGE'],
    ['patch', '/api/settings/alert-rules/1'], ['patch', '/api/settings/evc-min-notice'],
    ['get', '/api/email-preview'],
    ['get', '/api/dashboard/summary'], ['get', '/api/dashboard/breakdown?by=region'],
    ['get', '/api/dashboard/ageing'], ['get', '/api/dashboard/stage-durations'],
    ['get', '/api/reports/pending'], ['get', '/api/reports/pending/export'],
  ];
  it.each(ENDPOINTS)('%s %s answers 401 without a cookie', async (method, url) => {
    const res = await request(app)[method](url).send({});
    expect(res.status).toBe(401);
  });
});