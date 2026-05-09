const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect);

// SSE (admin only)
router.get('/api/sse/events', restrictTo('admin'), adminController.sseStream);

// Admin-only
router.get('/admin/users',                restrictTo('admin'), adminController.getUsers);
router.patch('/admin/users/:id/approve',  restrictTo('admin'), adminController.approveUser);
router.patch('/admin/users/:id/suspend',  restrictTo('admin'), adminController.suspendUser);
router.patch('/admin/users/:id/resume',   restrictTo('admin'), adminController.resumeUser);
router.patch('/admin/users/:id/password', restrictTo('admin'), adminController.changeUserPassword);
router.get('/admin/usage',                restrictTo('admin'), adminController.getUsageInsights);
router.get('/admin/logs',                 restrictTo('admin'), adminController.getAdminLogs);
router.post('/admin/reload-clients',      restrictTo('admin'), adminController.reloadClients);
router.post('/admin/recalculate-costs',   restrictTo('admin'), adminController.recalculateCosts);

module.exports = router;
