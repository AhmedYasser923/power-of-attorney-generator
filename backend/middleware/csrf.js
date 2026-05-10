'use strict';

const AppError = require('../utils/appError');
const { isOriginAllowed, normalizeOrigin } = require('../utils/allowedOrigins');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

module.exports = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const originHeader = req.get('Origin') || req.get('Referer');
  if (!originHeader) {
    return next(new AppError('Missing Origin header on state-changing request.', 403));
  }

  const origin = normalizeOrigin(originHeader);
  if (!origin) {
    return next(new AppError('Invalid Origin header.', 403));
  }

  if (!isOriginAllowed(origin, req)) {
    return next(new AppError('Cross-origin request blocked.', 403));
  }

  next();
};
