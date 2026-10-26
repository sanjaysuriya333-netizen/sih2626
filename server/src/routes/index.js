const router = require('express').Router();
const { health } = require('../controllers/healthController');

router.get('/health', health);
router.use('/auth', require('./auth'));

module.exports = router;