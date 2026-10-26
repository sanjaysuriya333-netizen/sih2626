const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { login, logout, me } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// 20 login requests per 15 min per IP (skipped in tests, which run many logins)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skip: () => process.env.NODE_ENV === 'test',
  handler: (req, res) =>
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many login attempts, try later', details: [] },
    }),
});

router.post('/login', loginLimiter, login);
router.post('/logout', logout);
router.get('/me', authenticate, me);

module.exports = router;