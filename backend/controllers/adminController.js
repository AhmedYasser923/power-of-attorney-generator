const mongoose = require('mongoose');
const User = require('../models/User');
const UsageLog = require('../models/UsageLog');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { MODEL_PRICING } = require('../utils/pricing');
const { OP_LABELS, EGYPT_MS } = require('../utils/constants');

exports.getUsers = catchAsync(async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).lean();
  res.json({ status: 'success', data: users });
});

exports.approveUser = catchAsync(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { status: 'active' },
    { new: true, runValidators: true }
  );
  if (!user) return next(new AppError('User not found.', 404));
  res.json({ status: 'success', data: { status: user.status } });
});

exports.suspendUser = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id);
  if (!user) return next(new AppError('User not found.', 404));
  if (user.role === 'admin') return next(new AppError('Cannot suspend admin accounts.', 403));
  await User.findByIdAndUpdate(req.params.id, { status: 'suspended' });
  res.json({ status: 'success' });
});

exports.resumeUser = catchAsync(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { status: 'active' },
    { new: true }
  );
  if (!user) return next(new AppError('User not found.', 404));
  res.json({ status: 'success', data: { status: user.status } });
});

exports.changeUserPassword = catchAsync(async (req, res, next) => {
  const { password } = req.body;
  if (!password || password.length < 8) {
    return next(new AppError('Password must be at least 8 characters.', 400));
  }

  const user = await User.findById(req.params.id).select('+password');
  if (!user) return next(new AppError('User not found.', 404));

  user.password = password;
  user.passwordChangedAt = new Date();
  await user.save(); // triggers bcrypt pre-save hook

  res.json({ status: 'success' });
});

exports.getUsageInsights = catchAsync(async (req, res) => {
  const now = new Date();
  const egyptNow = new Date(now.getTime() + EGYPT_MS);
  const year = parseInt(req.query.year) || egyptNow.getUTCFullYear();
  const month = parseInt(req.query.month) || (egyptNow.getUTCMonth() + 1);

  const [userTotals, opBreakdown, monthlyTotals] = await Promise.all([
    UsageLog.aggregate([
      { $match: { year, month } },
      {
        $group: {
          _id: { userId: '$userId', userName: '$userName' },
          totalCostUSD: { $sum: '$costUSD' },
          operationCount: { $sum: 1 }
        }
      },
      { $sort: { totalCostUSD: -1 } }
    ]),
    UsageLog.aggregate([
      { $match: { year, month } },
      {
        $group: {
          _id: '$operationType',
          count: { $sum: 1 },
          totalCostUSD: { $sum: '$costUSD' }
        }
      },
      { $sort: { totalCostUSD: -1 } }
    ]),
    UsageLog.aggregate([
      {
        $group: {
          _id: { year: '$year', month: '$month' },
          totalCostUSD: { $sum: '$costUSD' },
          operationCount: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $limit: 12 }
    ])
  ]);

  res.json({
    status: 'success',
    data: {
      userTotals,
      opBreakdown: opBreakdown.map(b => ({ ...b, label: OP_LABELS[b._id] || b._id })),
      monthlyTotals,
      year,
      month
    }
  });
});

// ── SSE: per-client stream ────────────────────────────────────────────────────
exports.sseStream = (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clients = req.app.get('sseClients');
  clients.add(res);

  // Send a keepalive comment every 25 s so Cloud Run / proxies don't time out
  const keepalive = setInterval(() => res.write(': keepalive\n\n'), 25000);

  req.on('close', () => {
    clearInterval(keepalive);
    clients.delete(res);
  });
};

// ── SSE: admin broadcast reload ───────────────────────────────────────────────
exports.reloadClients = (req, res) => {
  const clients = req.app.get('sseClients');
  let count = 0;
  clients.forEach(client => {
    client.write('data: reload\n\n');
    count++;
  });
  res.json({ status: 'success', clientsNotified: count });
};

exports.recalculateCosts = catchAsync(async (req, res) => {
  const logs = await UsageLog.find({ model: { $ne: null } }).lean();

  let updated = 0;
  let totalOldCost = 0;
  let totalNewCost = 0;

  const bulkOps = [];

  for (const log of logs) {
    const rates = MODEL_PRICING[log.model];
    if (!rates) continue;

    const newCost =
      (log.inputTokens / 1_000_000) * rates.input +
      (log.outputTokens / 1_000_000) * rates.output;

    if (newCost !== log.costUSD) {
      totalOldCost += log.costUSD || 0;
      totalNewCost += newCost;
      bulkOps.push({
        updateOne: {
          filter: { _id: log._id },
          update: { $set: { costUSD: newCost } }
        }
      });
      updated++;
    }
  }

  if (bulkOps.length > 0) {
    await UsageLog.bulkWrite(bulkOps);
  }

  res.json({
    status: 'success',
    data: {
      recordsScanned: logs.length,
      recordsUpdated: updated,
      totalOldCost: +totalOldCost.toFixed(6),
      totalNewCost: +totalNewCost.toFixed(6)
    }
  });
});

exports.getAdminLogs = catchAsync(async (req, res) => {
  const now = new Date();
  const egyptNow = new Date(now.getTime() + EGYPT_MS);
  const year = parseInt(req.query.year) || egyptNow.getUTCFullYear();
  const month = parseInt(req.query.month) || (egyptNow.getUTCMonth() + 1);
  const day = parseInt(req.query.day) || 0;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 25));
  const skip = (page - 1) * limit;

  let matchQuery = { year, month };
  if (day > 0) {
    const startOfDay = new Date(Date.UTC(year, month - 1, day) - EGYPT_MS);
    matchQuery.createdAt = { $gte: startOfDay, $lt: new Date(startOfDay.getTime() + 86400000) };
  }

  const [total, logs, costAgg] = await Promise.all([
    UsageLog.countDocuments(matchQuery),
    UsageLog.find(matchQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    UsageLog.aggregate([
      { $match: matchQuery },
      { $group: { _id: null, totalCostUSD: { $sum: '$costUSD' } } }
    ])
  ]);

  const totalCostUSD = costAgg.length > 0 ? costAgg[0].totalCostUSD : 0;

  res.json({
    status: 'success',
    data: {
      logs: logs.map(l => ({ ...l, label: OP_LABELS[l.operationType] || l.operationType })),
      total,
      totalCostUSD,
      page,
      totalPages: Math.ceil(total / limit) || 1
    }
  });
});
