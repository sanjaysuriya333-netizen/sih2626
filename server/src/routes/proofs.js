const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/undertakingController');

const ALL = ['OFFICER', 'SUPERVISOR', 'HEAD_OFFICE', 'INSTITUTION'];
const STAFF = ['OFFICER', 'SUPERVISOR', 'HEAD_OFFICE'];

router.get('/:id/file', authenticate, requireRole(...ALL), ctrl.file);
router.post('/:id/verify', authenticate, requireRole(...STAFF), ctrl.verify);

module.exports = router;