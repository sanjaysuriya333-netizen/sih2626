const rateLimit = require('express-rate-limit');

// Per-user limiter for routes that run after `authenticate`. Skipped in tests unless skipInTests is false.
function userLimiter({ windowMs, limit, skipInTests = true }) {
  return rateLimit({
    windowMs,
    limit,
    keyGenerator: (req) => `user-${req.user ? req.user.id : 'anon'}`,
    skip: () => skipInTests && process.env.NODE_ENV === 'test',
    handler: (req, res) =>
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests, try again in a minute', details: [] },
      }),
  });
}

module.exports = { userLimiter };