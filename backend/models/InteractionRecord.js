'use strict';

const mongoose = require('mongoose');

const interactionRecordSchema = new mongoose.Schema({
  ticketNumber: { type: String, required: true, trim: true },
  personName:   { type: String, required: true, trim: true },
  date:         { type: String, required: true },
  screenshot:   { type: String, default: '' },
  notes:        { type: String, default: '', trim: true },
  createdAt:    { type: Date, default: Date.now },
}, { versionKey: false });

interactionRecordSchema.index({ date: -1, createdAt: -1 });

module.exports = mongoose.model('InteractionRecord', interactionRecordSchema);
