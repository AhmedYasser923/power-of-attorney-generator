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
router.get('/login', authController.renderLogin);
router.post('/login', authController.login);
router.get('/signup', authController.renderSignup);
router.post('/signup', authController.signup);
router.get('/logout', authController.logout);

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

// --- Central Dashboard ---
router.get('/', (req, res, next) => {
  try {
    res.render('dashboard', { title: 'Main Workspace Dashboard' });
  } catch (error) {
    next(error);
  }
});

// --- POA Generator ---
router.get('/poa', reflyController.showForm);
router.get('/preview-lufthansa', lufthansaController.preview);
router.get('/ticket-analyzer', ticketController.renderAnalyzer);

// --- Tools Suite ---
router.get('/tools', toolsController.renderTools);
router.get('/api/tools/flight-status', toolsController.checkFlightStatus);
router.get('/api/tools/check-eoc', toolsController.checkEOC);
router.get('/api/tools/search-airports', toolsController.searchAirports);
router.get('/api/tools/check-docs', toolsController.checkDocs);
router.get('/api/tools/search-airlines', toolsController.searchAirlines);
router.get('/api/tools/lookup-iata', toolsController.lookupIATA);
router.post('/api/generate-email', toolsController.generateEmail);
router.post('/api/tools/sync-eoc', toolsController.syncEOC);

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
