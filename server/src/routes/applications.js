const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { create } = require('../controllers/applicationController');

// Every role may create (institutions submit their own); the service enforces who gets the file
router.post('/', authenticate, requireRole('OFFICER', 'SUPERVISOR', 'HEAD_OFFICE', 'INSTITUTION'), create);

module.exports = router;