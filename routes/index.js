const express = require('express');
const multer = require('multer');
const router = express.Router();

const aiController = require('../controllers/aiController.js');
const reflyController = require('../controllers/reflyController.js');
const lufthansaController = require('../controllers/lufthansaController.js');

const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// ROUTES
// ==========================================

// Main form page
router.get('/', reflyController.showForm);

// Preview route for Lufthansa template
router.get('/preview-lufthansa', lufthansaController.preview);

// PDF Generation Routes (Duplicates removed)
router.post('/generate-standard', upload.any(), reflyController.generateStandardPDF);
router.post('/generate-lufthansa', upload.any(), lufthansaController.generateLufthansaPDF);

// AI Extraction Route
router.post('/api/autofill', aiController.extractData);

module.exports = router;