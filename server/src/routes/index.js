const router = require('express').Router();
const { health } = require('../controllers/healthController');

router.get('/health', health);
router.use('/auth', require('./auth'));
router.use('/applications', require('./applications'));

module.exports = router;