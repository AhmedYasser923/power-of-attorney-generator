const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/api/me/usage', userController.getMyUsage);
router.get('/api/me/logs', userController.getUserLogs);

module.exports = router;
