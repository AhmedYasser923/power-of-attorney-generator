'use strict';

function sanitizeFilenameComponent(value, fallback = 'document') {
  const sanitized = String(value || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 50);

  return sanitized || fallback;
}

module.exports = { sanitizeFilenameComponent };
