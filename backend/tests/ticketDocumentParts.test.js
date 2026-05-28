'use strict';

const assert = require('node:assert/strict');
const {
  buildTicketDocumentParts,
  coordinateSortedPdfText,
  rawPdfText
} = require('../utils/ticketDocumentParts');

const silentLogger = { log() {} };

function pdfFile(buffer = Buffer.from('%PDF-test')) {
  return {
    buffer,
    mimetype: 'application/pdf',
    originalname: 'graphical-confirmation.pdf'
  };
}

const graphicalPdfData = {
  pages: [
    {
      content: [
        { str: 'AUH', x: 425, y: 185 },
        { str: 'MAD', x: 26, y: 185 },
        { str: 'Abu Dhabi', x: 418, y: 202 },
        { str: 'Madrid', x: 26, y: 202 },
        { str: '19:20', x: 447, y: 160 },
        { str: '09:45', x: 26, y: 159 },
        { str: 'EY 102', x: 500, y: 760 }
      ]
    }
  ]
};

{
  const text = coordinateSortedPdfText(graphicalPdfData);

  assert.match(text, /09:45 19:20/);
  assert.match(text, /MAD AUH/);
  assert.match(text, /Madrid Abu Dhabi/);
}

{
  const text = rawPdfText(graphicalPdfData);

  assert.match(text, /AUH MAD/);
  assert.match(text, /Abu Dhabi Madrid/);
}

(async () => {
  {
    const file = pdfFile();
    const parts = await buildTicketDocumentParts([file], {
      logger: silentLogger,
      pdfExtract: {
        extractBuffer: async () => graphicalPdfData
      }
    });

    assert.equal(parts.length, 2);
    assert.ok(parts[0].text.includes('visual layout is authoritative'));
    assert.ok(parts[0].text.includes('MAD AUH'));
    assert.ok(parts[0].text.includes('RAW PDF TEXT ORDER'));
    assert.equal(parts[1].inlineData.mimeType, 'application/pdf');
    assert.equal(parts[1].inlineData.data, file.buffer.toString('base64'));
  }

  {
    const file = pdfFile(Buffer.from('%PDF-scanned'));
    const parts = await buildTicketDocumentParts([file], {
      logger: silentLogger,
      pdfExtract: {
        extractBuffer: async () => {
          throw new Error('no text layer');
        }
      }
    });

    assert.equal(parts.length, 1);
    assert.equal(parts[0].inlineData.mimeType, 'application/pdf');
    assert.equal(parts[0].inlineData.data, file.buffer.toString('base64'));
  }

  console.log('ticketDocumentParts tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
