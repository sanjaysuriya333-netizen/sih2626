const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/reportController');

const STAFF = ['OFFICER', 'SUPERVISOR', 'HEAD_OFFICE'];

// Read only. The data scope (scopeApplications) is applied inside the service.
router.get('/:type', authenticate, requireRole(...STAFF), ctrl.list);
router.get('/:type/export', authenticate, requireRole(...STAFF), ctrl.exportCsv);

module.exports = router;