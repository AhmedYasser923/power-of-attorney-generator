'use strict';

exports.OP_LABELS = {
  ticket_analysis: 'Ticket Analysis',
  email_translation: 'Email Translation',
  poa_standard: 'POA (Standard)',
  poa_lufthansa: 'POA (Lufthansa)',
  poa_aerlingus: 'POA (Aer Lingus)',
  text_autofill: 'Text Autofill',
  barcode_decode: 'Barcode Decode',
  sig_processing: 'Signature Processing'
};

// Egypt is permanently UTC+2 (no DST since 2011)
exports.EGYPT_MS = 2 * 60 * 60 * 1000;
