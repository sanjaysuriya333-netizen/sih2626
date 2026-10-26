import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import request from 'supertest';
import express from 'express';

// Project code is CommonJS, so load it with require
const require = createRequire(import.meta.url);
const app = require('../src/app.js'); // loads dotenv first
const prisma = require('../src/utils/prisma.js');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { authenticate } = require('../src/middleware/auth.js');
const { scopeApplications } = require('../src/services/scope.js');

const PASSWORD = 'Demo@1234';
const login = (email, password = PASSWORD) =>
  request(app).post('/api/auth/login').send({ email, password });

// Sign a cookie for any user id (we only know the demo passwords)
const cookieFor = (id) => `token=${jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '5m' })}`;

// Test-only route: same pattern Stage 5 must use (AND with the scope helper)
const scopedApp = express();
scopedApp.use(cookieParser());
scopedApp.get('/applications/:id', authenticate, async (req, res, next) => {
  try {
    const found = await prisma.application.findFirst({
      where: { AND: [{ id: Number(req.params.id) }, scopeApplications(req.user)] },
    });
    if (!found) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found', details: [] } });
    res.json({ data: { id: found.id } });
  } catch (e) {
    next(e);
  }
});
const getApp = (id, userId) =>
  request(scopedApp).get(`/applications/${id}`).set('Cookie', userId ? cookieFor(userId) : []);

let officer1, sup1, head1, inst1, otherOfficer;
let ownApp, otherApp, instOwnApp, instOtherApp;

beforeAll(async () => {
  const byEmail = (email) => prisma.user.findUnique({ where: { email } });
  officer1 = await byEmail('officer1@demo.test');
  sup1 = await byEmail('supervisor1@demo.test');
  head1 = await byEmail('head1@demo.test');
  inst1 = await byEmail('institution1@demo.test');

  // an officer who reports to a different supervisor
  otherOfficer = await prisma.user.findFirst({
    where: { role: 'OFFICER', supervisorId: { not: sup1.id } },
  });
  ownApp = await prisma.application.findFirst({ where: { assignedOfficerId: officer1.id } });
  otherApp = await prisma.application.findFirst({ where: { assignedOfficerId: otherOfficer.id } });
  instOwnApp = await prisma.application.findFirst({ where: { institutionId: inst1.institutionId } });
  instOtherApp = await prisma.application.findFirst({ where: { institutionId: { not: inst1.institutionId } } });
});

afterAll(async () => {
  // leave the demo supervisor unlocked for the next person
  await prisma.user.update({ where: { id: sup1.id }, data: { failedLogins: 0, lockedUntil: null } });
  await prisma.$disconnect();
});

describe('login', () => {
  it('wrong password gives 401', async () => {
    const res = await login('officer1@demo.test', 'wrong-password');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('unknown email gives the same 401', async () => {
    const res = await login('nobody@demo.test', 'whatever');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('missing fields give 400', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('a successful login writes a LOGIN audit row', async () => {
    const before = await prisma.auditLog.count({ where: { userId: officer1.id, action: 'LOGIN' } });
    const res = await login('officer1@demo.test');
    expect(res.status).toBe(200);
    const after = await prisma.auditLog.count({ where: { userId: officer1.id, action: 'LOGIN' } });
    expect(after).toBe(before + 1);
  });
});

describe('/me and logout', () => {
  it.each([
    ['officer1@demo.test', 'OFFICER'],
    ['supervisor1@demo.test', 'SUPERVISOR'],
    ['head1@demo.test', 'HEAD_OFFICE'],
    ['institution1@demo.test', 'INSTITUTION'],
  ])('%s sees role %s from /me', async (email, role) => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email, password: PASSWORD });
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(email);
    expect(me.body.data.role).toBe(role);
    expect(me.body.data.passwordHash).toBeUndefined();
  });

  it('/me without a cookie gives 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('logout clears the session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'officer1@demo.test', password: PASSWORD });
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    await agent.post('/api/auth/logout');
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });
});

describe('data isolation', () => {
  it('officer reads own file', async () => {
    expect((await getApp(ownApp.id, officer1.id)).status).toBe(200);
  });

  it("officer cannot read another officer's file", async () => {
    expect([403, 404]).toContain((await getApp(otherApp.id, officer1.id)).status);
  });

  it("supervisor reads a team officer's file", async () => {
    expect((await getApp(ownApp.id, sup1.id)).status).toBe(200);
  });

  it("supervisor cannot read another team's file", async () => {
    expect([403, 404]).toContain((await getApp(otherApp.id, sup1.id)).status);
  });

  it('head office reads any file', async () => {
    expect((await getApp(ownApp.id, head1.id)).status).toBe(200);
    expect((await getApp(otherApp.id, head1.id)).status).toBe(200);
  });

  it('institution reads its own file', async () => {
    expect((await getApp(instOwnApp.id, inst1.id)).status).toBe(200);
  });

  it("institution cannot read another institution's file", async () => {
    expect([403, 404]).toContain((await getApp(instOtherApp.id, inst1.id)).status);
  });

  it('no cookie gives 401', async () => {
    expect((await getApp(ownApp.id, null)).status).toBe(401);
  });
});

describe('lockout', () => {
  it('locks after 5 failed attempts, even for the right password', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await login('supervisor1@demo.test', 'wrong-password');
      expect(res.status).toBe(401);
    }
    const res = await login('supervisor1@demo.test', PASSWORD);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });
});