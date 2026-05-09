const express = require('express');
const multer = require('multer');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const aiController = require('../controllers/aiController');
const { protect } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);

router.get('/api/flight-status',  ticketController.checkFlightStatus);
router.get('/api/check-eoc',      ticketController.checkEOC);
router.post('/api/autofill',      aiController.extractData);
router.post('/api/analyze-ticket', upload.any(), ticketController.analyzeTicket);

module.exports = router;
