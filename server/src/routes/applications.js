const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { create, completeStage } = require('../controllers/applicationController');

// Every role may create (institutions submit their own); the service enforces who gets the file
router.post('/', authenticate, requireRole('OFFICER', 'SUPERVISOR', 'HEAD_OFFICE', 'INSTITUTION'), create);

// Institutions never complete stages (their reply is completed by the officer)
router.post(
  '/:id/stages/complete',
  authenticate,
  requireRole('OFFICER', 'SUPERVISOR', 'HEAD_OFFICE'),
  completeStage,
);

module.exports = router;