'use strict';

const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  announcer: { type: String, required: true, trim: true },
  subject:   { type: String, required: true, trim: true },
  date:      { type: String, required: true },
  content:   { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

announcementSchema.index({ date: -1, createdAt: -1 });

module.exports = mongoose.model('Announcement', announcementSchema);
