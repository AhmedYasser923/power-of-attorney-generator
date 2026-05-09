const express = require('express');
const multer = require('multer');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const aiController = require('../controllers/aiController');
const { protect } = require('../middleware/auth');
const userRateLimit = require('../middleware/userRateLimit');
const { validateTicketFiles } = require('../middleware/validateUploads');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10,
    fieldSize: 1024 * 1024,
    parts: 25
  }
});

router.use('/api', protect);

router.get('/api/flight-status',  ticketController.checkFlightStatus);
router.get('/api/check-eoc',      ticketController.checkEOC);
router.post('/api/autofill',      userRateLimit, aiController.extractData);
router.post('/api/analyze-ticket', userRateLimit, upload.array('ticket', 10), validateTicketFiles, ticketController.analyzeTicket);

module.exports = router;
