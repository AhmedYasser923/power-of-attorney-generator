const express = require('express');
const multer = require('multer');
const router = express.Router();

const aiController = require('../controllers/aiController.js');
const reflyController = require('../controllers/reflyController.js');
const lufthansaController = require('../controllers/lufthansaController.js');
const aerlingusController = require('../controllers/aerlingusController.js');
const ticketController = require('../controllers/ticketController.js');

const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// ROUTES
// ==========================================

router.get('/', reflyController.showForm);
router.get('/preview-lufthansa', lufthansaController.preview);
router.get('/ticket-analyzer', ticketController.renderAnalyzer);

router.post('/generate-standard', upload.any(), reflyController.generateStandardPDF);
router.post('/generate-lufthansa', upload.any(), lufthansaController.generateLufthansaPDF);
router.post('/generate-aerlingus', upload.any(), aerlingusController.generateAerLingusPDF);


router.post('/api/autofill', aiController.extractData);
router.post('/api/analyze-ticket', upload.any(), ticketController.analyzeTicket);

// Add this next to your existing router.post('/api/analyze-ticket', ...) line

module.exports = router;