const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { userLimiter } = require('../middleware/rateLimit');
const ctrl = require('../controllers/reportController');

const STAFF = ['OFFICER', 'SUPERVISOR', 'HEAD_OFFICE'];
const MINUTE = 60 * 1000;
const screenLimit = userLimiter({ windowMs: MINUTE, limit: 120 });
const exportLimit = userLimiter({ windowMs: MINUTE, limit: 10 }); // a compliance CSV can read 1,000 files

// Read only. The data scope (scopeApplications) is applied inside the service.
router.get('/:type', authenticate, requireRole(...STAFF), screenLimit, ctrl.list);
router.get('/:type/export', authenticate, requireRole(...STAFF), exportLimit, ctrl.exportCsv);

module.exports = router;