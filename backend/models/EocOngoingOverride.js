'use strict';

const mongoose = require('mongoose');

const eocOngoingOverrideSchema = new mongoose.Schema({
  startDate: { type: String, required: true },
  location: { type: String, required: true },
  event:    { type: String, required: true },
  decision: { type: String, default: 'REJECT' },

  locationKey: { type: String, required: true },
  eventKey:    { type: String, required: true },
  decisionKey: { type: String, required: true },

  endDate: { type: String, default: '' },
  note:    { type: String, default: '' },

  closedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  closedByName:  { type: String, default: '' },
  closedByEmail: { type: String, default: '' },
  closedAt:      { type: Date, default: null },
  reopenedAt:    { type: Date, default: null },
}, {
  timestamps: true,
  versionKey: false,
});

eocOngoingOverrideSchema.index(
  { startDate: 1, locationKey: 1, eventKey: 1, decisionKey: 1 },
  { unique: true }
);

module.exports = mongoose.model('EocOngoingOverride', eocOngoingOverrideSchema);
