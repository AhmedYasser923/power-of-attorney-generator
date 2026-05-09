const express = require('express');
const multer = require('multer');
const router = express.Router();
const reflyController = require('../controllers/reflyController');
const lufthansaController = require('../controllers/lufthansaController');
const aerlingusController = require('../controllers/aerlingusController');
const { protect } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);

router.post('/api/poa/generate-standard',  upload.any(), reflyController.generateStandardPDF);
router.post('/api/poa/generate-lufthansa', upload.any(), lufthansaController.generateLufthansaPDF);
router.post('/api/poa/generate-aerlingus', upload.any(), aerlingusController.generateAerLingusPDF);

module.exports = router;
