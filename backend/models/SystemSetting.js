'use strict';

const mongoose = require('mongoose');

const systemSettingSchema = new mongoose.Schema({
  key:   { type: String, required: true, unique: true, trim: true },
  value: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { versionKey: false, timestamps: true });

module.exports = mongoose.model('SystemSetting', systemSettingSchema);
