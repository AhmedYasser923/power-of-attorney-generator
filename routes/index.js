const express = require('express');
const multer = require('multer');
const router = express.Router();
const aiController = require('../controllers/aiController.js');
// 1. Import BOTH controllers
const reflyController = require('../controllers/reflyController.js');
const lufthansaController = require('../controllers/lufthansaController.js');

// 2. Configure multer to handle file uploads in memory
const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// ROUTES
// ==========================================

// Main form page
router.get('/', reflyController.showForm);

// Preview route for Lufthansa template
router.get('/preview-lufthansa', lufthansaController.preview);



// PDF Generation Routes (Using the exact exported names)
router.post('/generate-standard', upload.any(), reflyController.generateStandardPDF);
router.post('/generate-lufthansa', upload.any(), lufthansaController.generateLufthansaPDF);

// PDF Generation Routes
router.post('/generate-standard', upload.any(), reflyController.generateStandardPDF);
router.post('/generate-lufthansa', upload.any(), lufthansaController.generateLufthansaPDF);

// AI Extraction Route
router.post('/api/autofill', aiController.extractData); // Add this line!

module.exports = router;