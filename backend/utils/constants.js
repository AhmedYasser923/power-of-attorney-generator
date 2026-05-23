'use strict';

const EMAIL_BUILDER_GROUP = 'email_builder';
const EMAIL_BUILDER_OPERATION_TYPES = [
  'email_translation',
  'email_translation_sync',
  'email_refinement'
];

exports.OP_LABELS = {
  ticket_analysis: 'Ticket Analysis',
  email_builder: 'Email Builder',
  email_translation: 'Email Translation',
  email_translation_sync: 'Email Translation Sync',
  email_refinement: 'Email Refinement',
  announcement_format: 'Announcement Format',
  announcement_label: 'Announcement Label',
  announcement_ask: 'Announcement Ask',
  poa_standard: 'POA (Standard)',
  poa_lufthansa: 'POA (Lufthansa)',
  poa_aerlingus: 'POA (Aer Lingus)',
  text_autofill: 'Text Autofill',
  barcode_decode: 'Barcode Decode',
  sig_processing: 'Signature Processing'
};

exports.EMAIL_BUILDER_GROUP = EMAIL_BUILDER_GROUP;
exports.EMAIL_BUILDER_OPERATION_TYPES = EMAIL_BUILDER_OPERATION_TYPES;

// Egypt is permanently UTC+2 (no DST since 2011)
exports.EGYPT_MS = 2 * 60 * 60 * 1000;
