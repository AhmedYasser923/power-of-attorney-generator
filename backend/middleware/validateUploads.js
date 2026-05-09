'use strict';

const sharp = require('sharp');
const { PDFExtract } = require('pdf.js-extract');
const AppError = require('../utils/appError');

const pdfExtract = new PDFExtract();
const MAX_IMAGE_PIXELS = 100_000_000;
const MAX_PDF_PAGES = 50;

const SIGNATURES = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47]
};

function matchesMagic(buffer, expected) {
  if (!buffer || buffer.length < expected.length) return false;
  return expected.every((byte, index) => buffer[index] === byte);
}

function isWebP(buffer) {
  return buffer?.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50;
}

function detectMimeType(buffer) {
  if (matchesMagic(buffer, SIGNATURES['application/pdf'])) return 'application/pdf';
  if (matchesMagic(buffer, SIGNATURES['image/jpeg'])) return 'image/jpeg';
  if (matchesMagic(buffer, SIGNATURES['image/png'])) return 'image/png';
  if (isWebP(buffer)) return 'image/webp';
  return null;
}

async function validateImageDimensions(file) {
  let metadata;

  try {
    metadata = await sharp(file.buffer, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
  } catch {
    throw new AppError(`Image "${file.originalname}" could not be processed safely.`, 400);
  }

  if (!metadata.width || !metadata.height) {
    throw new AppError(`Image "${file.originalname}" has invalid dimensions.`, 400);
  }

  if (metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
    throw new AppError(`Image "${file.originalname}" exceeds maximum pixel limit.`, 400);
  }
}

async function validatePdfPageCount(file) {
  let data;

  try {
    data = await pdfExtract.extractBuffer(file.buffer);
  } catch {
    throw new AppError(`PDF "${file.originalname}" could not be parsed safely.`, 400);
  }

  if (data.pages?.length > MAX_PDF_PAGES) {
    throw new AppError(`PDF "${file.originalname}" exceeds maximum page limit (${MAX_PDF_PAGES} pages).`, 400);
  }
}

function collectFiles(files) {
  if (!files) return [];
  if (Array.isArray(files)) return files;
  return Object.values(files).flat();
}

exports.validateTicketFiles = async (req, res, next) => {
  try {
    const files = collectFiles(req.files);

    for (const file of files) {
      const detected = detectMimeType(file.buffer);

      if (!detected) {
        throw new AppError(
          `File "${file.originalname}" has invalid content. Only PDF, JPEG, PNG, and WebP are accepted.`,
          400
        );
      }

      file.detectedMimeType = detected;
      file.mimetype = detected;

      if (detected.startsWith('image/')) {
        await validateImageDimensions(file);
      } else if (detected === 'application/pdf') {
        await validatePdfPageCount(file);
      }
    }

    next();
  } catch (err) {
    next(err);
  }
};

exports.validateSignatureFiles = async (req, res, next) => {
  try {
    const files = collectFiles(req.files);

    for (const file of files) {
      const detected = detectMimeType(file.buffer);

      if (!detected || !detected.startsWith('image/')) {
        throw new AppError(
          `File "${file.originalname}" is not a valid image. Only JPEG, PNG, and WebP are accepted.`,
          400
        );
      }

      file.detectedMimeType = detected;
      file.mimetype = detected;

      if (file.size > 5 * 1024 * 1024) {
        throw new AppError('Signature image must be under 5 MB.', 400);
      }

      await validateImageDimensions(file);
    }

    next();
  } catch (err) {
    next(err);
  }
};
