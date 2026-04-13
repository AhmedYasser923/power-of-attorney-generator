const mongoose = require('mongoose');
const User = require('../models/User');
const UsageLog = require('../models/UsageLog');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

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
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [
    pendingUsers,
    allUsers,
    monthlyTotals,
    opBreakdown,
    recentOps,
    onlineCount
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
    UsageLog.find({ year, month }).sort({ createdAt: -1 }).limit(50).lean(),
    Promise.resolve(0)
  ]);

  // Per-user totals for this month
  const userTotals = await UsageLog.aggregate([
    { $match: { year, month } },
    {
      $group: {
        _id: { userId: '$userId', userName: '$userName' },
        totalCostUSD: { $sum: '$costUSD' },
        totalCostEGP: { $sum: '$costEGP' },
        operationCount: { $sum: 1 }
      }
    },
    { $sort: { totalCostUSD: -1 } }
  ]);

  const userTotalsMap = {};
  userTotals.forEach(t => {
    userTotalsMap[t._id.userId.toString()] = {
      totalCostUSD: t.totalCostUSD,
      totalCostEGP: t.totalCostEGP,
      operationCount: t.operationCount
    };
  });

  const usersWithStats = allUsers.map(u => ({
    ...u,
    ...(userTotalsMap[u._id.toString()] || { totalCostUSD: 0, totalCostEGP: 0, operationCount: 0 })
  }));

  const totalCostThisMonth = opBreakdown.reduce((s, b) => s + b.totalCostUSD, 0);
  const totalOpsThisMonth = opBreakdown.reduce((s, b) => s + b.count, 0);

  res.render('dashboard-admin', {
    title: 'Admin Panel',
    pendingUsers,
    users: usersWithStats,
    monthlyTotals,
    opBreakdown: opBreakdown.map(b => ({ ...b, label: OP_LABELS[b._id] || b._id })),
    recentOps: recentOps.map(o => ({ ...o, label: OP_LABELS[o.operationType] || o.operationType })),
    onlineCount,
    totalCostThisMonth,
    totalOpsThisMonth,
    pendingCount: pendingUsers.length,
    currentYear: year,
    currentMonth: month
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
  const year = parseInt(req.query.year) || now.getFullYear();
  const month = parseInt(req.query.month) || (now.getMonth() + 1);

  const [userTotals, opBreakdown, monthlyTotals] = await Promise.all([
    UsageLog.aggregate([
      { $match: { year, month } },
      {
        $group: {
          _id: { userId: '$userId', userName: '$userName' },
          totalCostUSD: { $sum: '$costUSD' },
          totalCostEGP: { $sum: '$costEGP' },
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
