const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { create, completeStage, list, getOne, filters } = require('../controllers/applicationController');

const ALL = ['OFFICER', 'SUPERVISOR', 'HEAD_OFFICE', 'INSTITUTION'];

// Every role may create (institutions submit their own); the service enforces who gets the file
router.post('/', authenticate, requireRole(...ALL), create);

// Reads: the data scope (scopeApplications) limits what each role gets back
router.get('/', authenticate, requireRole(...ALL), list);
router.get('/filters', authenticate, requireRole(...ALL), filters); // must stay above '/:id'
router.get('/:id', authenticate, requireRole(...ALL), getOne);

// Institutions never complete stages (their reply is completed by the officer)
router.post('/:id/stages/complete', authenticate, requireRole('OFFICER', 'SUPERVISOR', 'HEAD_OFFICE'), completeStage);

module.exports = router;