'use strict';

const sharp = require('sharp');
const { PDFExtract } = require('pdf.js-extract');

const defaultPdfExtract = new PDFExtract();
const PDF_TEXT_HELPER_MIN_CHARS = 50;
const PDF_ROW_Y_TOLERANCE = 3;

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function rawPdfText(data) {
  return (data.pages || [])
    .map((page) => (page.content || []).map((item) => item.str).join(' '))
    .map(normalizeText)
    .filter(Boolean)
    .join('\n');
}

function findRow(rows, y) {
  return rows.find((row) => Math.abs(row.y - y) <= PDF_ROW_Y_TOLERANCE);
}

function coordinateSortedPdfText(data) {
  return (data.pages || [])
    .map((page, pageIndex) => {
      const rows = [];

      (page.content || []).forEach((item) => {
        const text = normalizeText(item.str);
        if (!text) return;

        const y = Number(item.y);
        const x = Number(item.x);
        if (!Number.isFinite(y) || !Number.isFinite(x)) return;

        let row = findRow(rows, y);
        if (!row) {
          row = { y, items: [] };
          rows.push(row);
        }

        row.items.push({ x, text });
      });

      const lines = rows
        .sort((a, b) => a.y - b.y)
        .map((row) => row.items
          .sort((a, b) => a.x - b.x)
          .map((item) => item.text)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim())
        .filter(Boolean);

      return [`[Page ${pageIndex + 1} visual row text]`, ...lines].join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

function buildPdfHelperText(file, data) {
  const coordinateText = coordinateSortedPdfText(data);
  const linearText = rawPdfText(data);
  const helperBody = [
    coordinateText && `COORDINATE-SORTED TEXT:\n${coordinateText}`,
    linearText && `RAW PDF TEXT ORDER:\n${linearText}`
  ].filter(Boolean).join('\n\n');

  if (helperBody.length < PDF_TEXT_HELPER_MIN_CHARS) return null;

  return [
    `[PDF helper text: ${file.originalname || 'uploaded PDF'}]`,
    'The attached PDF visual layout is authoritative. This helper text is only for searchable strings and may contain layout/order errors.',
    helperBody
  ].join('\n');
}

async function buildPdfParts(file, { pdfExtract = defaultPdfExtract, logger = console } = {}) {
  const parts = [
    {
      inlineData: {
        data: file.buffer.toString('base64'),
        mimeType: 'application/pdf'
      }
    }
  ];

  try {
    const data = await pdfExtract.extractBuffer(file.buffer);
    const helperText = buildPdfHelperText(file, data);

    if (helperText) {
      logger.log(`[PDF] Visual PDF + helper text (${helperText.length} chars).`);
      parts.unshift({ text: helperText });
    } else {
      logger.log('[PDF] Visual PDF only; extracted text helper was too small.');
    }
  } catch (err) {
    logger.log(`[PDF] Visual PDF only; text extraction failed: ${err.message}`);
  }

  return parts;
}

async function buildImagePart(file, { imageProcessor = sharp } = {}) {
  const processed = await imageProcessor(file.buffer)
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer();

  return {
    inlineData: {
      data: processed.toString('base64'),
      mimeType: 'image/jpeg'
    }
  };
}

async function buildTicketDocumentParts(files, options = {}) {
  const documentParts = [];

  for (const file of files) {
    if (file.mimetype === 'application/pdf') {
      documentParts.push(...await buildPdfParts(file, options));
    } else if (file.mimetype?.startsWith('image/')) {
      documentParts.push(await buildImagePart(file, options));
    } else {
      documentParts.push({
        inlineData: {
          data: file.buffer.toString('base64'),
          mimeType: file.mimetype
        }
      });
    }
  }

  return documentParts;
}

module.exports = {
  buildPdfHelperText,
  buildTicketDocumentParts,
  coordinateSortedPdfText,
  rawPdfText
};
