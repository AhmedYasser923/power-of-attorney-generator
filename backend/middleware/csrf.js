'use strict';

const AppError = require('../utils/appError');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function getAllowedOrigins(req) {
  const configured = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
    : [];
  const host = req.get('Host');

  if (host) {
    const proto = req.secure ? 'https' : 'http';
    configured.push(`${proto}://${host}`);
  }

  return configured;
}

module.exports = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const originHeader = req.get('Origin') || req.get('Referer');
  if (!originHeader) {
    return next(new AppError('Missing Origin header on state-changing request.', 403));
  }

  let origin;
  try {
    origin = new URL(originHeader).origin;
  } catch {
    return next(new AppError('Invalid Origin header.', 403));
  }

  if (!getAllowedOrigins(req).includes(origin)) {
    return next(new AppError('Cross-origin request blocked.', 403));
  }

  next();
};
