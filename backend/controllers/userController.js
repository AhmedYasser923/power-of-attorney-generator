'use strict';

const UsageLog = require('../models/UsageLog');
const catchAsync = require('../utils/catchAsync');
const { EGYPT_MS } = require('../utils/constants');
const {
  getGroupedLogStages,
  getUsageBreakdownStages,
  labelUsageRows
} = require('../utils/usageGrouping');

exports.getMyUsage = catchAsync(async (req, res) => {
  const now = new Date();
  const egyptNow = new Date(now.getTime() + EGYPT_MS);
  const year = parseInt(req.query.year) || egyptNow.getUTCFullYear();
  const month = parseInt(req.query.month) || (egyptNow.getUTCMonth() + 1);

  const breakdown = await UsageLog.aggregate([
    { $match: { userId: req.user._id, year, month } },
    ...getUsageBreakdownStages()
  ]);

  res.json({ status: 'success', data: labelUsageRows(breakdown) });
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

  const [totalOperations, grouped, costAgg] = await Promise.all([
    UsageLog.countDocuments(matchQuery),
    UsageLog.aggregate([
      { $match: matchQuery },
      ...getGroupedLogStages(),
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          logs: [
            { $skip: skip },
            { $limit: limit }
          ],
          total: [
            { $count: 'count' }
          ]
        }
      }
    ]),
    UsageLog.aggregate([
      { $match: matchQuery },
      { $group: { _id: null, totalCostUSD: { $sum: '$costUSD' } } }
    ])
  ]);
  const groupedPayload = grouped[0] || {};
  const logs = groupedPayload.logs || [];
  const total = groupedPayload.total?.[0]?.count || 0;
  const totalCostUSD = costAgg.length > 0 ? costAgg[0].totalCostUSD : 0;

  res.json({
    status: 'success',
    data: {
      logs: labelUsageRows(logs),
      total,
      totalOperations,
      totalCostUSD,
      page,
      totalPages: Math.ceil(total / limit) || 1
    }
  });
});
