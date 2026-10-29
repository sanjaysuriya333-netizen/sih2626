const router = require('express').Router();
const { health } = require('../controllers/healthController');

router.get('/health', health);
router.use('/auth', require('./auth'));
router.use('/applications', require('./applications'));
router.use('/evc', require('./evc'));
router.use('/undertakings', require('./undertakings'));
router.use('/proofs', require('./proofs'));
router.use('/documents', require('./documents'));
router.use('/notifications', require('./notifications'));
router.use('/settings', require('./settings'));
router.use('/email-preview', require('./emailPreview'));
router.use('/dashboard', require('./dashboard'));
router.use('/reports', require('./reports'));
router.use('/admin', require('./admin'));

module.exports = router;