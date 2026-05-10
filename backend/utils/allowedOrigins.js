'use strict';

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://refly-workspace.refly.com:5173',
];

function normalizeOrigin(value) {
  if (!value) return '';

  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

function getConfiguredOrigins() {
  return process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS
        .split(',')
        .map((origin) => normalizeOrigin(origin.trim()))
        .filter(Boolean)
    : [];
}

function getRequestOrigin(req) {
  const host = req.get('Host');
  if (!host) return '';

  return `${req.protocol}://${host}`;
}

function getAllowedOrigins(req) {
  const origins = [
    ...getConfiguredOrigins(),
    ...(process.env.NODE_ENV === 'production' ? [] : DEFAULT_DEV_ORIGINS),
  ];

  const requestOrigin = getRequestOrigin(req);
  if (requestOrigin) origins.push(requestOrigin);

  return [...new Set(origins)];
}

function isOriginAllowed(value, req) {
  const origin = normalizeOrigin(value);
  if (!origin) return false;

  return getAllowedOrigins(req).includes(origin);
}

module.exports = {
  getAllowedOrigins,
  isOriginAllowed,
  normalizeOrigin,
};
