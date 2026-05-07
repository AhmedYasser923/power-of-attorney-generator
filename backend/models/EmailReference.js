'use strict';

const mongoose = require('mongoose');

const emailReferenceSchema = new mongoose.Schema({
  title:   { type: String, required: true, trim: true },
  content: { type: String, required: true },
}, { timestamps: true, versionKey: false });

module.exports = mongoose.model('EmailReference', emailReferenceSchema);
