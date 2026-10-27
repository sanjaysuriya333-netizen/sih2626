const router = require('express').Router();
const { health } = require('../controllers/healthController');

router.get('/health', health);
router.use('/auth', require('./auth'));
router.use('/applications', require('./applications'));
router.use('/evc', require('./evc'));
router.use('/undertakings', require('./undertakings'));
router.use('/proofs', require('./proofs'));

module.exports = router;