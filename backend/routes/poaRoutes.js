const express = require('express');
const multer = require('multer');
const router = express.Router();
const reflyController = require('../controllers/reflyController');
const lufthansaController = require('../controllers/lufthansaController');
const aerlingusController = require('../controllers/aerlingusController');
const { protect } = require('../middleware/auth');
const userRateLimit = require('../middleware/userRateLimit');
const { validateSignatureFiles } = require('../middleware/validateUploads');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 5,
    fieldSize: 512 * 1024,
    parts: 30
  }
});

router.use('/api/poa', protect);

router.post('/api/poa/generate-standard',  userRateLimit, upload.any(), validateSignatureFiles, reflyController.generateStandardPDF);
router.post('/api/poa/generate-lufthansa', userRateLimit, upload.any(), validateSignatureFiles, lufthansaController.generateLufthansaPDF);
router.post('/api/poa/generate-aerlingus', userRateLimit, upload.any(), validateSignatureFiles, aerlingusController.generateAerLingusPDF);

module.exports = router;
