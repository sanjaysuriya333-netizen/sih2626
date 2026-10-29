const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/dashboardController');

const ALL = ['OFFICER', 'SUPERVISOR', 'HEAD_OFFICE', 'INSTITUTION'];

// Read only. The data scope (scopeApplications) is applied inside the service for every number.
router.get('/summary', authenticate, requireRole(...ALL), ctrl.summary);
router.get('/breakdown', authenticate, requireRole(...ALL), ctrl.breakdown);
router.get('/ageing', authenticate, requireRole(...ALL), ctrl.ageing);
router.get('/stage-durations', authenticate, requireRole(...ALL), ctrl.stageDurations);

module.exports = router;