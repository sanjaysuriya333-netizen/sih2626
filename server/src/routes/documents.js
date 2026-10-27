const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const uploadProof = require('../middleware/uploadProof');
const ctrl = require('../controllers/documentController');

const ALL = ['OFFICER', 'SUPERVISOR', 'HEAD_OFFICE', 'INSTITUTION'];
const STAFF = ['OFFICER', 'SUPERVISOR', 'HEAD_OFFICE'];

// Scope (own files, own team, own institution) is applied inside the service
router.get('/', authenticate, requireRole(...ALL), ctrl.list);
router.post('/', authenticate, requireRole(...ALL), ctrl.create);
// Login and role are checked BEFORE the upload is read
router.post('/:id/renew', authenticate, requireRole('INSTITUTION'), uploadProof, ctrl.renew);
router.post('/:id/renewal-decision', authenticate, requireRole(...STAFF), ctrl.decide);

module.exports = router;