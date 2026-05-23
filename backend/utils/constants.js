'use strict';

const EMAIL_BUILDER_GROUP = 'email_builder';
const EMAIL_BUILDER_OPERATION_TYPES = [
  'email_translation',
  'email_translation_sync',
  'email_refinement'
];

const ANNOUNCEMENT_GROUP = 'announcements';
const ANNOUNCEMENT_OPERATION_TYPES = [
  'announcement_format',
  'announcement_label',
  'announcement_ask'
];

const TRACKERS_GROUP = 'trackers';
const TRACKER_OPERATION_TYPES = ['tracker_search'];

const DOC_CHECK_GROUP = 'doc_check';
const DOC_CHECK_OPERATION_TYPES = ['doc_check'];

const IATA_LOOKUP_GROUP = 'iata_lookup';
const IATA_LOOKUP_OPERATION_TYPES = ['iata_lookup'];

const JURISDICTION_GROUP = 'jurisdiction';
const JURISDICTION_OPERATION_TYPES = ['jurisdiction_check'];

const EC261_GROUP = 'ec261';
const EC261_OPERATION_TYPES = ['ec261_calc'];

exports.OP_LABELS = {
  ticket_analysis: 'Ticket Analysis',
  email_builder: 'Email Builder',
  email_translation: 'Email Translation',
  email_translation_sync: 'Email Translation Sync',
  email_refinement: 'Email Refinement',
  announcements: 'Announcements',
  announcement_format: 'Announcement Format',
  announcement_label: 'Announcement Label',
  announcement_ask: 'Announcement Ask',
  trackers: 'Trackers',
  tracker_search: 'Tracker Search',
  doc_check: 'Doc Check',
  iata_lookup: 'IATA Lookup',
  jurisdiction: 'Jurisdiction',
  jurisdiction_check: 'Jurisdiction Check',
  ec261: 'EC261 Calculator',
  ec261_calc: 'EC261 Calculation',
  poa_standard: 'POA (Standard)',
  poa_lufthansa: 'POA (Lufthansa)',
  poa_aerlingus: 'POA (Aer Lingus)',
  text_autofill: 'Text Autofill',
  barcode_decode: 'Barcode Decode',
  sig_processing: 'Signature Processing'
};

exports.EMAIL_BUILDER_GROUP = EMAIL_BUILDER_GROUP;
exports.EMAIL_BUILDER_OPERATION_TYPES = EMAIL_BUILDER_OPERATION_TYPES;
exports.ANNOUNCEMENT_GROUP = ANNOUNCEMENT_GROUP;
exports.ANNOUNCEMENT_OPERATION_TYPES = ANNOUNCEMENT_OPERATION_TYPES;
exports.TRACKERS_GROUP = TRACKERS_GROUP;
exports.TRACKER_OPERATION_TYPES = TRACKER_OPERATION_TYPES;
exports.DOC_CHECK_GROUP = DOC_CHECK_GROUP;
exports.DOC_CHECK_OPERATION_TYPES = DOC_CHECK_OPERATION_TYPES;
exports.IATA_LOOKUP_GROUP = IATA_LOOKUP_GROUP;
exports.IATA_LOOKUP_OPERATION_TYPES = IATA_LOOKUP_OPERATION_TYPES;
exports.JURISDICTION_GROUP = JURISDICTION_GROUP;
exports.JURISDICTION_OPERATION_TYPES = JURISDICTION_OPERATION_TYPES;
exports.EC261_GROUP = EC261_GROUP;
exports.EC261_OPERATION_TYPES = EC261_OPERATION_TYPES;

// Egypt is permanently UTC+2 (no DST since 2011)
exports.EGYPT_MS = 2 * 60 * 60 * 1000;
