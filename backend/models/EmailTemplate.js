'use strict';

const mongoose = require('mongoose');

const emailTemplateSchema = new mongoose.Schema({
  key:        { type: String, required: true, unique: true, trim: true },
  text:       { type: String, required: true },
  type:       { type: String, enum: ['document', 'rejection'], required: true },
  label:      { type: String, required: true, trim: true },
  category:   { type: String, required: true, trim: true },
  isInfoOnly: { type: Boolean, default: false },
  noWrapper:  { type: Boolean, default: false },
}, { versionKey: false });

module.exports = mongoose.model('EmailTemplate', emailTemplateSchema);
