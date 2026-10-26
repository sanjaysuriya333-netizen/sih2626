const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { logAction } = require('../services/audit');

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  region: u.region,
  institutionId: u.institutionId,
  supervisorId: u.supervisorId,
});

const cookieOptions = (expires) => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  expires,
});

exports.login = asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Email and password are required', parsed.error.issues);
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });

  // Unknown email: same answer as a wrong password
  if (!user || !user.active) {
    await logAction({ action: 'LOGIN_FAILED', entity: 'user', after: { email } });
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Wrong email or password');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await logAction({ userId: user.id, action: 'LOGIN_BLOCKED', entity: 'user', entityId: user.id });
    throw new HttpError(401, 'ACCOUNT_LOCKED', 'Account locked for 15 minutes after too many failed attempts');
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLogins + 1;
    const lock = failed >= MAX_FAILED;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins: lock ? 0 : failed,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null,
      },
    });
    await logAction({ userId: user.id, action: 'LOGIN_FAILED', entity: 'user', entityId: user.id });
    if (lock) {
      await logAction({ userId: user.id, action: 'ACCOUNT_LOCKED', entity: 'user', entityId: user.id });
    }
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Wrong email or password');
  }

  // Success: clear the counters, issue the cookie
  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  });
  const expires = new Date(jwt.decode(token).exp * 1000);
  res.cookie('token', token, cookieOptions(expires));

  await logAction({ userId: user.id, action: 'LOGIN', entity: 'user', entityId: user.id });
  res.json({ data: publicUser(user) });
});

exports.logout = asyncHandler(async (req, res) => {
  // Works even if the token has expired; log it only when we can tell who it was
  try {
    const payload = jwt.verify(req.cookies && req.cookies.token, process.env.JWT_SECRET);
    await logAction({ userId: payload.id, action: 'LOGOUT', entity: 'user', entityId: payload.id });
  } catch {
    /* no valid token: nothing to log */
  }
  res.clearCookie('token', cookieOptions());
  res.json({ data: { loggedOut: true } });
});

exports.me = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  res.json({ data: publicUser(user) });
});