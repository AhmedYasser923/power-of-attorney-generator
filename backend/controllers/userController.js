'use strict';

const UsageLog = require('../models/UsageLog');
const catchAsync = require('../utils/catchAsync');
const { OP_LABELS, EGYPT_MS } = require('../utils/constants');

exports.getMyUsage = catchAsync(async (req, res) => {
  const now = new Date();
  const egyptNow = new Date(now.getTime() + EGYPT_MS);
  const year = parseInt(req.query.year) || egyptNow.getUTCFullYear();
  const month = parseInt(req.query.month) || (egyptNow.getUTCMonth() + 1);

  const breakdown = await UsageLog.aggregate([
    { $match: { userId: req.user._id, year, month } },
    { $group: {
      _id: '$operationType',
      count: { $sum: 1 },
      totalCostUSD: { $sum: '$costUSD' }
    }},
    { $sort: { totalCostUSD: -1 } }
  ]);

  res.json({ status: 'success', data: breakdown });
});

exports.getUserLogs = catchAsync(async (req, res) => {
  const now = new Date();
  const egyptNow = new Date(now.getTime() + EGYPT_MS);
  const year = parseInt(req.query.year) || egyptNow.getUTCFullYear();
  const month = parseInt(req.query.month) || (egyptNow.getUTCMonth() + 1);
  const day = parseInt(req.query.day) || 0;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 25));
  const skip = (page - 1) * limit;

  let matchQuery = { userId: req.user._id, year, month };
  if (day > 0) {
    const startOfDay = new Date(Date.UTC(year, month - 1, day) - EGYPT_MS);
    matchQuery.createdAt = { $gte: startOfDay, $lt: new Date(startOfDay.getTime() + 86400000) };
  }

  const [total, logs] = await Promise.all([
    UsageLog.countDocuments(matchQuery),
    UsageLog.find(matchQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  res.json({
    status: 'success',
    data: {
      logs: logs.map(l => ({ ...l, label: OP_LABELS[l.operationType] || l.operationType })),
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1
    }
  });
});
