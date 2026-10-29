const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/emailPreviewController');

router.get('/', authenticate, requireRole('HEAD_OFFICE'), ctrl.list);

module.exports = router;