const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const uploadCsv = require('../middleware/uploadCsv');
const {
  create,
  completeStage,
  list,
  getOne,
  filters,
  importCsv,
} = require('../controllers/applicationController');
const { record: recordUndertaking } = require('../controllers/undertakingController');

const ALL = ['OFFICER', 'SUPERVISOR', 'HEAD_OFFICE', 'INSTITUTION'];
const STAFF = ['OFFICER', 'SUPERVISOR', 'HEAD_OFFICE'];

// Every role may create (institutions submit their own); the service enforces who gets the file
router.post('/', authenticate, requireRole(...ALL), create);

// Staff only. Login and role are checked BEFORE any upload is read.
router.post('/import', authenticate, requireRole(...STAFF), uploadCsv, importCsv);

// Reads: the data scope (scopeApplications) limits what each role gets back
router.get('/', authenticate, requireRole(...ALL), list);
router.get('/filters', authenticate, requireRole(...ALL), filters); // must stay above '/:id'
router.get('/:id', authenticate, requireRole(...ALL), getOne);

// Institutions never complete stages (their reply is completed by the officer)
router.post('/:id/stages/complete', authenticate, requireRole(...STAFF), completeStage);

// Staff records a promise (undertaking) on a file within their scope
router.post('/:id/undertakings', authenticate, requireRole(...STAFF), recordUndertaking);

module.exports = router;