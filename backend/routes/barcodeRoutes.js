const express = require('express');
const multer = require('multer');

const barcodeController = require('../controllers/barcodeController');
const { protect } = require('../middleware/auth');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fieldSize: 1024 * 1024,
    parts: 5,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
      return;
    }

    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
  },
});

router.use('/api', protect);

router.post('/api/decode-barcode', upload.single('barcode'), barcodeController.decodeBarcode);

module.exports = router;
