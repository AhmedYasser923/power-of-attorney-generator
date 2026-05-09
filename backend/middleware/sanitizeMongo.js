'use strict';

const { sanitize } = require('express-mongo-sanitize');

function sanitizePart(req, key) {
  if (!req[key]) return;

  const sanitized = sanitize(req[key]);

  if (key === 'query') {
    Object.defineProperty(req, 'query', {
      configurable: true,
      enumerable: true,
      value: sanitized,
      writable: true
    });
    return;
  }

  req[key] = sanitized;
}

module.exports = (req, res, next) => {
  sanitizePart(req, 'body');
  sanitizePart(req, 'params');
  sanitizePart(req, 'query');
  next();
};
