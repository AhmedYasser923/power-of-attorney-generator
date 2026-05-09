'use strict';

const AppError = require('../utils/appError');

const WINDOW_MS = 15 * 60 * 1000;
const MAX_AI_REQUESTS = 30;
const userWindows = new Map();

function cleanExpired() {
  const now = Date.now();

  for (const [key, record] of userWindows) {
    if (now - record.windowStart > WINDOW_MS) userWindows.delete(key);
  }
}

setInterval(cleanExpired, 5 * 60 * 1000).unref();

module.exports = (req, res, next) => {
  if (!req.user) return next();

  const userId = req.user._id.toString();
  const now = Date.now();
  let record = userWindows.get(userId);

  if (!record || now - record.windowStart > WINDOW_MS) {
    record = { count: 0, windowStart: now };
    userWindows.set(userId, record);
  }

  record.count += 1;

  if (record.count > MAX_AI_REQUESTS) {
    return next(new AppError('Personal AI request limit reached. Please try again later.', 429));
  }

  next();
};
