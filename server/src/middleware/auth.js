const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');

// Reads the token cookie, loads the user, sets req.user
const authenticate = asyncHandler(async (req, res, next) => {
  const token = req.cookies && req.cookies.token;
  if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'Please log in');

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Session expired, please log in again');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!user || !user.active) throw new HttpError(401, 'UNAUTHENTICATED', 'Please log in');

  req.user = {
    id: user.id,
    role: user.role,
    region: user.region,
    institutionId: user.institutionId,
    supervisorId: user.supervisorId,
  };
  next();
});

// Use after authenticate: requireRole('SUPERVISOR', 'HEAD_OFFICE')
const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, 'FORBIDDEN', 'You do not have permission for this action'));
    }
    next();
  };

module.exports = { authenticate, requireRole };