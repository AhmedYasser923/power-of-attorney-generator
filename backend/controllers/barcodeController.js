'use strict';

const { execFile } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'decode_barcode.py');
const WINDOWS_PYTHON_CANDIDATES = [
  path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'python.exe'),
  path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'python.exe'),
  path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python310', 'python.exe'),
  'python',
  'py',
];

function pythonCandidates() {
  if (process.env.PYTHON_BIN) return [process.env.PYTHON_BIN];
  if (process.platform === 'win32') return WINDOWS_PYTHON_CANDIDATES;
  return ['python3', 'python'];
}

function tempImagePath(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff'].includes(ext) ? ext : '.png';
  return path.join(os.tmpdir(), `barcode-${Date.now()}-${Math.random().toString(36).slice(2)}${safeExt}`);
}

function runDecoderWithPython(pythonBin, imagePath) {
  return new Promise((resolve, reject) => {
    execFile(pythonBin, [SCRIPT, imagePath], { timeout: 15000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      const output = stdout.trim();
      if (output) {
        try {
          resolve(JSON.parse(output));
          return;
        } catch (parseError) {
          if (!error) {
            reject(new AppError('Failed to parse decode result', 500));
            return;
          }
        }
      }

      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }

      reject(new Error('Decoder returned an empty response'));
    });
  });
}

async function runDecoder(imagePath) {
  const errors = [];

  for (const pythonBin of pythonCandidates()) {
    try {
      return await runDecoderWithPython(pythonBin, imagePath);
    } catch (error) {
      errors.push(`${pythonBin}: ${error.message}`);
    }
  }

  throw new AppError(`Barcode decode failed: ${errors.join(' | ')}`, 500);
}

exports.decodeBarcode = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('No barcode image provided', 400));
  }

  const tmpPath = tempImagePath(req.file);

  try {
    await fs.writeFile(tmpPath, req.file.buffer);
    const result = await runDecoder(tmpPath);
    res.status(200).json(result);
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
});
