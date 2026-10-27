const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const evc = require('../controllers/evcController');

// Staff only; the data scope is applied inside the service
router.use(authenticate, requireRole('OFFICER', 'SUPERVISOR', 'HEAD_OFFICE'));

router.get('/queue', evc.queue);
router.get('/', evc.list);
router.post('/:applicationId/schedule', evc.schedule);
router.post('/:visitId/complete', evc.complete);

module.exports = router;