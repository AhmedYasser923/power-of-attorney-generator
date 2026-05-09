const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// Public
router.get('/logout', authController.logout);
router.post('/api/auth/login', authController.apiLogin);
router.post('/api/auth/signup', authController.apiSignup);

// Protected
router.get('/api/auth/me', protect, authController.apiGetMe);
router.post('/api/auth/logout', protect, authController.apiLogout);

module.exports = router;
