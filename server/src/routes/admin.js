const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/adminController');

router.post('/run-daily-check', authenticate, requireRole('HEAD_OFFICE'), ctrl.runDailyCheck);

module.exports = router;