'use strict';

const assert = require('node:assert/strict');
const {
  buildDateCandidates,
  enrichBarcodeResult
} = require('../utils/barcodeTicketEnrichment');

function enrich(raw, parsed = {}) {
  return enrichBarcodeResult({ success: true, raw, parsed }).parsed;
}

{
  const parsed = enrich('ABC0061234567890XYZ', { operatingCarrier: 'DL' });

  assert.equal(parsed.eTicketNumber, '0061234567890');
  assert.equal(parsed.ticketPrefix, '006');
  assert.equal(parsed.ticketIssuer.airlines[0].name, 'Delta Air Lines');
  assert.equal(parsed.ticketExtraction.confidence, 'high');
}

{
  const parsed = enrich('TICKET 006 1234567890 END', { operatingCarrier: 'DL' });

  assert.equal(parsed.eTicketNumber, '0061234567890');
  assert.ok(parsed.ticketExtraction.sources.includes('separator-normalized-13'));
}

{
  const parsed = enrich('JUNK10061234567890END', {
    operatingCarrier: 'DL',
    eTicketNumber: '1006123456789',
  });

  assert.equal(parsed.eTicketNumber, '0061234567890');
  assert.equal(parsed.ticketPrefix, '006');
}

{
  const parsed = enrich('ABC3211234567890XYZ', { operatingCarrier: 'DL' });

  assert.equal(parsed.eTicketNumber, '3211234567890');
  assert.equal(parsed.ticketPrefix, '321');
  assert.equal(parsed.ticketIssuer.matchFound, false);
  assert.match(parsed.ticketExtraction.warning, /not in airline data/);
}

{
  const candidates = buildDateCandidates({ julianDate: '147', flightDate: '2026-05-27' }, { endYear: 2026 });

  assert.equal(candidates.narrowedByVisibleDate, true);
  assert.deepEqual(candidates.possibleYears, [2021, 2022, 2023, 2025, 2026]);
}

{
  const candidates = buildDateCandidates({ julianDate: '147', flightDate: '2024-05-26' }, { endYear: 2026 });

  assert.equal(candidates.narrowedByVisibleDate, true);
  assert.deepEqual(candidates.possibleYears, [2020, 2024]);
}

{
  const parsed = enrich('ABC0061234567890XYZ', {
    operatingCarrier: 'DL',
    julianDate: '147',
    flightDate: '2026-05-27',
  });

  assert.ok(parsed.dateCandidates.possibleYears.includes(2026));
  assert.ok(!parsed.dateCandidates.possibleYears.includes(2024));
}

console.log('barcodeTicketEnrichment tests passed');
