const express = require('express');
const router = express.Router();

// Lightweight version check - clients poll this to detect deploys
router.get('/api/version', (req, res) => {
  res.json({ version: req.app.get('appVersion') });
});

router.use('/', require('./authRoutes'));
router.use('/', require('./userRoutes'));
router.use('/', require('./adminRoutes'));
router.use('/', require('./toolsRoutes'));
router.use('/', require('./poaRoutes'));
router.use('/', require('./ticketRoutes'));

module.exports = router;
