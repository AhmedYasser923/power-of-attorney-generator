const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
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

const reactIndex = path.join(__dirname, '..', '..', 'client', 'dist', 'index.html');
const serveReactApp = (req, res, next) => {
  if (!fs.existsSync(reactIndex)) return next();
  return res.sendFile(reactIndex);
};

// ==========================================
// PUBLIC — Auth Routes (no protection)
// ==========================================
router.get('/login', serveReactApp, authController.renderLogin);
router.post('/login', authController.login);
router.get('/signup', serveReactApp, authController.renderSignup);
router.post('/signup', authController.signup);
router.get('/logout', authController.logout);
router.post('/api/auth/login', authController.apiLogin);
router.post('/api/auth/signup', authController.apiSignup);
router.get('/api/auth/me', authController.apiGetMe);

// Lightweight version check — clients poll this to detect deploys
router.get('/api/version', (req, res) => {
  res.json({ version: req.app.get('appVersion') });
});

// ==========================================
// PROTECTED — All routes below require login
// ==========================================
router.use(protect);

// --- User profile & usage dashboard ---
router.get('/me', require('../controllers/userController.js').renderDashboard);
router.get('/api/me/usage', require('../controllers/userController.js').getMyUsage);
router.get('/api/me/logs', require('../controllers/userController.js').getUserLogs);

// SSE: real-time event stream (all logged-in users)
router.get('/api/sse/events', require('../controllers/adminController.js').sseStream);

// --- Admin routes ---
router.use('/admin', restrictTo('admin'));
router.get('/admin', require('../controllers/adminController.js').renderDashboard);
router.get('/admin/users', require('../controllers/adminController.js').getUsers);
router.patch('/admin/users/:id/approve', require('../controllers/adminController.js').approveUser);
router.patch('/admin/users/:id/suspend', require('../controllers/adminController.js').suspendUser);
router.patch('/admin/users/:id/resume', require('../controllers/adminController.js').resumeUser);
router.patch('/admin/users/:id/password', require('../controllers/adminController.js').changeUserPassword);
router.get('/admin/usage', require('../controllers/adminController.js').getUsageInsights);
router.get('/admin/usage/:year/:month', require('../controllers/adminController.js').getMonthDetail);
router.get('/admin/logs', require('../controllers/adminController.js').getAdminLogs);
router.post('/admin/reload-clients', require('../controllers/adminController.js').reloadClients);
router.post('/admin/recalculate-costs', require('../controllers/adminController.js').recalculateCosts);

// --- Central Dashboard (shows My Usage) ---
router.get('/', require('../controllers/userController.js').renderDashboard);

// --- POA Generator ---
router.get('/poa', (req, res) => res.redirect(302, '/tools#poa'));
router.get('/preview-lufthansa', lufthansaController.preview);
router.get('/ticket-analyzer', (req, res) => res.redirect(302, '/tools#ticket-analyzer'));

// --- Tools Suite ---
router.get('/tools', toolsController.renderTools);
router.get('/api/tools/proxy/:host/*rest',  toolsController.proxyPage);
router.get('/api/tools/flight-status',     toolsController.checkFlightStatus);
router.get('/api/tools/check-eoc', toolsController.checkEOC);
router.get('/api/tools/search-airports', toolsController.searchAirports);
router.get('/api/tools/check-docs', toolsController.checkDocs);
router.get('/api/tools/search-airlines', toolsController.searchAirlines);
router.get('/api/tools/lookup-iata', toolsController.lookupIATA);
router.post('/api/generate-email', toolsController.generateEmail);
router.get('/api/tools/email-templates',    toolsController.getEmailTemplates);
router.post('/api/tools/email-templates',   toolsController.createEmailTemplate);
router.put('/api/tools/email-templates',    toolsController.updateEmailTemplate);
router.delete('/api/tools/email-templates', toolsController.deleteEmailTemplate);
router.post('/api/tools/sync-eoc', toolsController.syncEOC);
router.get('/api/tools/announcements',        toolsController.getAnnouncements);
router.post('/api/tools/announcements',       upload.array('images', 10), toolsController.addAnnouncement);
router.post('/api/tools/announcements/ask',   toolsController.askAnnouncements);
router.delete('/api/tools/announcements/:id', toolsController.deleteAnnouncement);
router.get('/api/tools/interactions',         toolsController.getInteractions);
router.post('/api/tools/interactions',        upload.single('screenshot'), toolsController.addInteraction);
router.delete('/api/tools/interactions/:id',  toolsController.deleteInteraction);

// --- POA Generation ---
router.post('/generate-standard', upload.any(), reflyController.generateStandardPDF);
router.post('/generate-lufthansa', upload.any(), lufthansaController.generateLufthansaPDF);
router.post('/generate-aerlingus', upload.any(), aerlingusController.generateAerLingusPDF);

// --- Ticket Analyzer ---
router.get('/api/flight-status', ticketController.checkFlightStatus);
router.get('/api/check-eoc', ticketController.checkEOC);
router.post('/api/autofill', aiController.extractData);
router.post('/api/analyze-ticket', upload.any(), ticketController.analyzeTicket);

module.exports = router;
