'use strict';
const mongoose = require('mongoose');

const eocRecordSchema = new mongoose.Schema({
  category: { type: String, required: true },
  date:     { type: String, required: true },   // stored as 'YYYY-MM-DD'
  event:    { type: String, required: true },
  location: { type: String, required: true },
  decision: { type: String, default: 'REJECT' },
}, { versionKey: false });

// Compound index: location + date covers both exact and range queries
eocRecordSchema.index({ location: 1, date: 1 });
// Index for date-only queries (ongoing issues)
eocRecordSchema.index({ date: 1 });
// Cursor pagination for the full EOC records list
eocRecordSchema.index({ date: -1, _id: -1 });

module.exports = mongoose.model('EocRecord', eocRecordSchema);
