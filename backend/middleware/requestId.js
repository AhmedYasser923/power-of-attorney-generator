'use strict';

const crypto = require('node:crypto');

module.exports = (req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};
