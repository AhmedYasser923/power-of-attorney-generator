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
  // Egypt is permanently UTC+2 (no DST since 2011)
  const EGYPT_MS = 2 * 60 * 60 * 1000;
  const egyptNow = new Date(now.getTime() + EGYPT_MS);
  const year = parseInt(req.query.year) || egyptNow.getUTCFullYear();
  const month = parseInt(req.query.month) || (egyptNow.getUTCMonth() + 1);

  const startOfToday = new Date(Date.UTC(egyptNow.getUTCFullYear(), egyptNow.getUTCMonth(), egyptNow.getUTCDate()) - EGYPT_MS);
  const startOfTomorrow = new Date(startOfToday.getTime() + 86400000);

  const [breakdown, recentLogs, totalLogs, dailyAgg] = await Promise.all([
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
    UsageLog.countDocuments({ userId: req.user._id, year, month }),
    UsageLog.aggregate([
      { $match: {
        userId: req.user._id,
        createdAt: { $gte: startOfToday, $lt: startOfTomorrow }
      }},
      { $group: { _id: null, totalCostUSD: { $sum: '$costUSD' }, count: { $sum: 1 } } }
    ])
  ]);

  const totalOps = breakdown.reduce((s, b) => s + b.count, 0);
  const totalCostUSD = breakdown.reduce((s, b) => s + b.totalCostUSD, 0);

  const dailyOps = dailyAgg.length > 0 ? dailyAgg[0].count : 0;
  const dailyCost = dailyAgg.length > 0 ? dailyAgg[0].totalCostUSD : 0;

  // Build month options from all months that have data for this user
  const monthsWithData = await UsageLog.aggregate([
    { $match: { userId: req.user._id } },
    { $group: { _id: { year: '$year', month: '$month' } } },
    { $sort: { '_id.year': -1, '_id.month': -1 } }
  ]);

  const monthNames = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
  const currentNow = new Date();
  const curY = currentNow.getFullYear();
  const curM = currentNow.getMonth() + 1;

  // Always include current month even if no data yet
  const seen = new Set();
  const monthOptions = [];

  seen.add(`${curY}-${curM}`);
  monthOptions.push({
    year: curY, month: curM,
    label: `${monthNames[curM - 1]} ${curY}`,
    selected: curY === year && curM === month
  });

  // Add all months with data (skip current if already added)
  monthsWithData.forEach(m => {
    const key = `${m._id.year}-${m._id.month}`;
    if (!seen.has(key)) {
      seen.add(key);
      monthOptions.push({
        year: m._id.year, month: m._id.month,
        label: `${monthNames[m._id.month - 1]} ${m._id.year}`,
        selected: m._id.year === year && m._id.month === month
      });
    }
  });

  res.render('dashboard-user', {
    title: 'My Usage',
    breakdown: breakdown.map(b => ({ ...b, label: OP_LABELS[b._id] || b._id })),
    recentLogs: recentLogs.map(l => ({ ...l, label: OP_LABELS[l.operationType] || l.operationType })),
    totalOps,
    totalCostUSD,
    dailyOps,
    dailyCost,
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
  const egyptNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
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
  const egyptNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const year = parseInt(req.query.year) || egyptNow.getUTCFullYear();
  const month = parseInt(req.query.month) || (egyptNow.getUTCMonth() + 1);
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
