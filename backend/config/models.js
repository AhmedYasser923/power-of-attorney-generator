'use strict';

// Single source of truth for Gemini model selection.
// Change a value here to switch a feature's model — or set the matching env var.
// Note: if you point at a new model, add a row to backend/utils/pricing.js
// or cost logs will silently record $0.

const pick = (envKey, fallback) => process.env[envKey]?.trim() || fallback;

module.exports = {
  ticketAnalysis: pick('GEMINI_MODEL_TICKET',        'gemini-3.5-flash'),
  textAutofill:   pick('GEMINI_MODEL_TEXT_AUTOFILL', 'gemini-3.1-flash-lite-preview'),
  emailBuilder:   pick('GEMINI_MODEL_EMAIL',         'gemini-3.1-flash-lite'),
  signature: {
    'gemini-easy':   pick('GEMINI_MODEL_SIG_EASY',   'gemini-2.5-flash-image'),
    'gemini-medium': pick('GEMINI_MODEL_SIG_MEDIUM', 'gemini-3.1-flash-image-preview'),
    'gemini-hard':   pick('GEMINI_MODEL_SIG_HARD',   'gemini-3-pro-image-preview'),
  },
};
