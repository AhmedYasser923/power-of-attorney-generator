'use strict';

const AppError = require('../utils/appError');

function assertString(value, fieldName, { maxLength = 1000, required = true } = {}) {
  if (required && (value === undefined || value === null || value === '')) {
    throw new AppError(`${fieldName} is required.`, 400);
  }

  if (value !== undefined && value !== null) {
    if (typeof value !== 'string') throw new AppError(`${fieldName} must be text.`, 400);
    if (value.length > maxLength) throw new AppError(`${fieldName} is too long (max ${maxLength} chars).`, 400);
  }
}

function assertEmail(value) {
  assertString(value, 'Email', { maxLength: 254 });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new AppError('Invalid email format.', 400);
  }
}

function assertEnum(value, fieldName, allowed) {
  if (!allowed.includes(value)) {
    throw new AppError(`${fieldName} must be one of: ${allowed.join(', ')}.`, 400);
  }
}

function assertInt(value, fieldName, { min = 0, max = 100000 } = {}) {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed < min || parsed > max) {
    throw new AppError(`${fieldName} must be a number between ${min} and ${max}.`, 400);
  }

  return parsed;
}

module.exports = { assertEmail, assertEnum, assertInt, assertString };
