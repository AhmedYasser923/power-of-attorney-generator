const mongoose = require('mongoose');
const UsageLog = require('../models/UsageLog');
const catchAsync = require('../utils/catchAsync');

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
  const year = parseInt(req.query.year) || now.getFullYear();
  const month = parseInt(req.query.month) || (now.getMonth() + 1);

  const [breakdown, recentLogs, totalLogs] = await Promise.all([
    UsageLog.aggregate([
      { $match: { userId: req.user._id, year, month } },
      { $group: {
        _id: '$operationType',
        count: { $sum: 1 },
        totalCostUSD: { $sum: '$costUSD' }
      }},
      { $sort: { totalCostUSD: -1 } }
    ]),
    UsageLog.find({ userId: req.user._id, year, month })
      .sort({ createdAt: -1 })
      .limit(25)
      .lean(),
    UsageLog.countDocuments({ userId: req.user._id, year, month })
  ]);

  const totalOps = breakdown.reduce((s, b) => s + b.count, 0);
  const totalCostUSD = breakdown.reduce((s, b) => s + b.totalCostUSD, 0);

  // Build month options for the last 12 months
  const monthOptions = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthOptions.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      label: d.toLocaleString('default', { month: 'long', year: 'numeric' }),
      selected: d.getFullYear() === year && (d.getMonth() + 1) === month
    });
  }

  res.render('dashboard-user', {
    title: 'My Usage',
    breakdown: breakdown.map(b => ({ ...b, label: OP_LABELS[b._id] || b._id })),
    recentLogs: recentLogs.map(l => ({ ...l, label: OP_LABELS[l.operationType] || l.operationType })),
    totalOps,
    totalCostUSD,
    monthOptions,
    currentYear: year,
    currentMonth: month,
    totalLogs,
    totalPages: Math.ceil(totalLogs / 25) || 1,
    currentPage: 1
  });
});

exports.getMyUsage = catchAsync(async (req, res) => {
  const now = new Date();
  const year = parseInt(req.query.year) || now.getFullYear();
  const month = parseInt(req.query.month) || (now.getMonth() + 1);

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
  const year = parseInt(req.query.year) || now.getFullYear();
  const month = parseInt(req.query.month) || (now.getMonth() + 1);
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 25));
  const skip = (page - 1) * limit;

  const [total, logs] = await Promise.all([
    UsageLog.countDocuments({ userId: req.user._id, year, month }),
    UsageLog.find({ userId: req.user._id, year, month })
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
