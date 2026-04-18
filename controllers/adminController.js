const mongoose = require('mongoose');
const User = require('../models/User');
const UsageLog = require('../models/UsageLog');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { MODEL_PRICING } = require('../utils/pricing');

const OP_LABELS = {
  ticket_analysis: 'Ticket Analysis',
  email_translation: 'Email Translation',
  poa_standard: 'POA (Standard)',
  poa_lufthansa: 'POA (Lufthansa)',
  poa_aerlingus: 'POA (Aer Lingus)',
  text_autofill: 'Text Autofill',
  sig_processing: 'Signature Processing'
};

exports.renderDashboard = catchAsync(async (req, res) => {
  const now = new Date();
  // Egypt is permanently UTC+2 (no DST since 2011)
  const EGYPT_MS = 2 * 60 * 60 * 1000;
  const egyptNow = new Date(now.getTime() + EGYPT_MS);
  const year = egyptNow.getUTCFullYear();
  const month = egyptNow.getUTCMonth() + 1;

  const startOfToday = new Date(Date.UTC(year, month - 1, egyptNow.getUTCDate()) - EGYPT_MS);
  const startOfTomorrow = new Date(startOfToday.getTime() + 86400000);

  const [
    pendingUsers,
    allUsers,
    monthlyTotals,
    opBreakdown,
    recentOps,
    onlineCount,
    totalRecentOps,
    dailyAgg
  ] = await Promise.all([
    User.find({ status: 'pending' }).sort({ createdAt: -1 }).lean(),
    User.find().sort({ createdAt: -1 }).lean(),
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
    UsageLog.find({ year, month }).sort({ createdAt: -1 }).limit(25).lean(),
    Promise.resolve(0),
    UsageLog.countDocuments({ year, month }),
    UsageLog.aggregate([
      { $match: { createdAt: { $gte: startOfToday, $lt: startOfTomorrow } } },
      { $group: { _id: null, totalCostUSD: { $sum: '$costUSD' }, count: { $sum: 1 } } }
    ])
  ]);

  // Per-user totals for this month
  const userTotals = await UsageLog.aggregate([
    { $match: { year, month } },
    {
      $group: {
        _id: { userId: '$userId', userName: '$userName' },
        totalCostUSD: { $sum: '$costUSD' },
        operationCount: { $sum: 1 }
      }
    },
    { $sort: { totalCostUSD: -1 } }
  ]);

  const userTotalsMap = {};
  userTotals.forEach(t => {
    userTotalsMap[t._id.userId.toString()] = {
      totalCostUSD: t.totalCostUSD,
      operationCount: t.operationCount
    };
  });

  const usersWithStats = allUsers.map(u => ({
    ...u,
    ...(userTotalsMap[u._id.toString()] || { totalCostUSD: 0, operationCount: 0 })
  }));

  const totalCostThisMonth = opBreakdown.reduce((s, b) => s + b.totalCostUSD, 0);
  const totalOpsThisMonth = opBreakdown.reduce((s, b) => s + b.count, 0);

  const dailyOps = dailyAgg.length > 0 ? dailyAgg[0].count : 0;
  const dailyCost = dailyAgg.length > 0 ? dailyAgg[0].totalCostUSD : 0;

  // Add totalCostUSD to users for the dashboard
  const usersWithTotals = usersWithStats.map(u => ({
    ...u,
    totalCostUSD: u.totalCostUSD || 0
  }));

  // Build dynamic month options from all months that have data
  const monthsWithData = await UsageLog.aggregate([
    { $group: { _id: { year: '$year', month: '$month' } } },
    { $sort: { '_id.year': -1, '_id.month': -1 } }
  ]);

  const monthNames = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
  const seen = new Set();
  const monthOptions = [];

  seen.add(`${year}-${month}`);
  monthOptions.push({
    year, month,
    label: `${monthNames[month - 1]} ${year}`,
    selected: true
  });

  monthsWithData.forEach(m => {
    const key = `${m._id.year}-${m._id.month}`;
    if (!seen.has(key)) {
      seen.add(key);
      monthOptions.push({
        year: m._id.year, month: m._id.month,
        label: `${monthNames[m._id.month - 1]} ${m._id.year}`,
        selected: false
      });
    }
  });

  res.render('dashboard-admin', {
    title: 'Admin Panel',
    pendingUsers,
    users: usersWithTotals,
    monthlyTotals,
    opBreakdown: opBreakdown.map(b => ({ ...b, label: OP_LABELS[b._id] || b._id })),
    recentOps: recentOps.map(o => ({ ...o, label: OP_LABELS[o.operationType] || o.operationType })),
    onlineCount,
    totalCostThisMonth,
    totalOpsThisMonth,
    dailyOps,
    dailyCost,
    pendingCount: pendingUsers.length,
    currentYear: year,
    currentMonth: month,
    opsTotalLogs: totalRecentOps,
    opsTotalPages: Math.ceil(totalRecentOps / 25) || 1,
    opsCurrentPage: 1,
    monthOptions
  });
});

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
  const egyptNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
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

exports.getMonthDetail = catchAsync(async (req, res) => {
  const year = parseInt(req.params.year);
  const month = parseInt(req.params.month);

  const logs = await UsageLog.find({ year, month })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  res.json({
    status: 'success',
    data: logs.map(l => ({ ...l, label: OP_LABELS[l.operationType] || l.operationType }))
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
  const egyptNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const year = parseInt(req.query.year) || egyptNow.getUTCFullYear();
  const month = parseInt(req.query.month) || (egyptNow.getUTCMonth() + 1);
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 25));
  const skip = (page - 1) * limit;

  const [total, logs, costAgg] = await Promise.all([
    UsageLog.countDocuments({ year, month }),
    UsageLog.find({ year, month })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    UsageLog.aggregate([
      { $match: { year, month } },
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
