const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const uploadProof = require('../middleware/uploadProof');
const ctrl = require('../controllers/undertakingController');

const ALL = ['OFFICER', 'SUPERVISOR', 'HEAD_OFFICE', 'INSTITUTION'];

// Scope (own institution / own files) is applied inside the service
router.get('/', authenticate, requireRole(...ALL), ctrl.list);
// Login and role are checked BEFORE the upload is read
router.post('/:id/proofs', authenticate, requireRole('INSTITUTION'), uploadProof, ctrl.upload);

module.exports = router;