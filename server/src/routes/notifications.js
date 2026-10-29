const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/notificationController');

const ALL = ['OFFICER', 'SUPERVISOR', 'HEAD_OFFICE', 'INSTITUTION'];

// Every role sees its own notifications; the service filters by user_id
router.get('/', authenticate, requireRole(...ALL), ctrl.list);
router.get('/unread-count', authenticate, requireRole(...ALL), ctrl.unreadCount);
router.post('/read-all', authenticate, requireRole(...ALL), ctrl.readAll); // before /:id
router.post('/:id/read', authenticate, requireRole(...ALL), ctrl.read);

module.exports = router;