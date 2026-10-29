const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/settingsController');

// Head office only (the matrix in docs/roles.md: "Edit settings")
router.use(authenticate, requireRole('HEAD_OFFICE'));
router.get('/', ctrl.get);
router.put('/alert-steps/:kind', ctrl.putSteps);
router.patch('/alert-rules/:id', ctrl.patchRule);
router.patch('/evc-min-notice', ctrl.patchEvc);

module.exports = router;