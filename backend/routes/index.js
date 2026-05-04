const express = require('express');
const multer = require('multer');
const router = express.Router();

const aiController = require('../controllers/aiController.js');
const reflyController = require('../controllers/reflyController.js');
const lufthansaController = require('../controllers/lufthansaController.js');
const aerlingusController = require('../controllers/aerlingusController.js');
const ticketController = require('../controllers/ticketController.js');
const toolsController = require('../controllers/toolsController.js');
const authController = require('../controllers/authController.js');
const { protect, restrictTo } = require('../middleware/auth.js');

const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// PUBLIC — Auth Routes (no protection)
// ==========================================
router.get('/logout', authController.logout);
router.post('/api/auth/login', authController.apiLogin);
router.post('/api/auth/signup', authController.apiSignup);

// Lightweight version check — clients poll this to detect deploys
router.get('/api/version', (req, res) => {
  res.json({ version: req.app.get('appVersion') });
});

// ==========================================
// PROTECTED — All routes below require login
// ==========================================
router.use(protect);

// --- Auth: session check (requires valid cookie) ---
router.get('/api/auth/me', authController.apiGetMe);

// --- User profile & usage dashboard ---
router.get('/api/me/usage', require('../controllers/userController.js').getMyUsage);
router.get('/api/me/logs', require('../controllers/userController.js').getUserLogs);

// SSE: real-time event stream (all logged-in users)
router.get('/api/sse/events', require('../controllers/adminController.js').sseStream);

// --- Admin routes ---
router.get('/admin/users',                restrictTo('admin'), require('../controllers/adminController.js').getUsers);
router.patch('/admin/users/:id/approve',  restrictTo('admin'), require('../controllers/adminController.js').approveUser);
router.patch('/admin/users/:id/suspend',  restrictTo('admin'), require('../controllers/adminController.js').suspendUser);
router.patch('/admin/users/:id/resume',   restrictTo('admin'), require('../controllers/adminController.js').resumeUser);
router.patch('/admin/users/:id/password', restrictTo('admin'), require('../controllers/adminController.js').changeUserPassword);
router.get('/admin/usage',                restrictTo('admin'), require('../controllers/adminController.js').getUsageInsights);
router.get('/admin/logs',                 restrictTo('admin'), require('../controllers/adminController.js').getAdminLogs);
router.post('/admin/reload-clients',      restrictTo('admin'), require('../controllers/adminController.js').reloadClients);
router.post('/admin/recalculate-costs',   restrictTo('admin'), require('../controllers/adminController.js').recalculateCosts);

// --- Tools Suite ---
router.get('/api/tools/flight-status',   toolsController.checkFlightStatus);
router.get('/api/tools/check-eoc',       toolsController.checkEOC);
router.get('/api/tools/search-airports', toolsController.searchAirports);
router.get('/api/tools/check-docs',      toolsController.checkDocs);
router.get('/api/tools/search-airlines', toolsController.searchAirlines);
router.get('/api/tools/lookup-iata',     toolsController.lookupIATA);
router.post('/api/tools/generate-email', toolsController.generateEmail);
router.get('/api/tools/email-templates',    toolsController.getEmailTemplates);
router.post('/api/tools/email-templates',   toolsController.createEmailTemplate);
router.put('/api/tools/email-templates',    toolsController.updateEmailTemplate);
router.delete('/api/tools/email-templates', toolsController.deleteEmailTemplate);
router.post('/api/tools/sync-eoc',       toolsController.syncEOC);

// --- POA Generation ---
router.post('/api/poa/generate-standard',  upload.any(), reflyController.generateStandardPDF);
router.post('/api/poa/generate-lufthansa', upload.any(), lufthansaController.generateLufthansaPDF);
router.post('/api/poa/generate-aerlingus', upload.any(), aerlingusController.generateAerLingusPDF);

// --- Ticket Analyzer ---
router.get('/api/flight-status',  ticketController.checkFlightStatus);
router.get('/api/check-eoc',      ticketController.checkEOC);
router.post('/api/autofill',      aiController.extractData);
router.post('/api/analyze-ticket', upload.any(), ticketController.analyzeTicket);

module.exports = router;
