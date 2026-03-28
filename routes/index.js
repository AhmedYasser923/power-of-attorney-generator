const express = require('express');
const multer = require('multer');
const router = express.Router();

const aiController = require('../controllers/aiController.js');
const reflyController = require('../controllers/reflyController.js');
const lufthansaController = require('../controllers/lufthansaController.js');
const aerlingusController = require('../controllers/aerlingusController.js');
const ticketController = require('../controllers/ticketController.js');
const toolsController = require('../controllers/toolsController.js');

const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// ROUTES
// ==========================================

// --- NEW: Central Dashboard Route ---
router.get('/', (req, res, next) => {
  try {
    res.render('dashboard', { title: 'Main Workspace Dashboard' });
  } catch (error) {
    next(error);
  }
});

// --- MODIFIED: Moved POA Generator out of root ---
router.get('/poa', reflyController.showForm);

router.get('/preview-lufthansa', lufthansaController.preview);
router.get('/ticket-analyzer', ticketController.renderAnalyzer);

// --- NEW ISOLATED TOOLS SUITE ROUTES ---
router.get('/tools', toolsController.renderTools);
router.get('/api/tools/flight-status', toolsController.checkFlightStatus);
router.get('/api/tools/check-eoc', toolsController.checkEOC);
router.get('/api/tools/search-airports', toolsController.searchAirports);

router.post('/generate-standard', upload.any(), reflyController.generateStandardPDF);
router.post('/generate-lufthansa', upload.any(), lufthansaController.generateLufthansaPDF);
router.post('/generate-aerlingus', upload.any(), aerlingusController.generateAerLingusPDF);

// Ticket analyzer routes
router.get('/api/flight-status', ticketController.checkFlightStatus);
router.get('/api/check-eoc', ticketController.checkEOC);
router.post('/api/autofill', aiController.extractData);
router.post('/api/analyze-ticket', upload.any(), ticketController.analyzeTicket);

module.exports = router;