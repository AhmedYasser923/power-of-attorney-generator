const UsageLog = require('../models/UsageLog');

/**
 * Log a cost-generating operation to MongoDB and broadcast to admin dashboard.
 * Fire-and-forget: a failure here never propagates to the main request flow.
 */
const USD_TO_EGP = 53; // 0.01 USD = 0.53 EGP

module.exports = async function logUsage(req, {
  operationType,
  model = null,
  inputTokens = 0,
  outputTokens = 0,
  costUSD = 0,
  metadata = {}
} = {}) {
  try {
    const user = req.user;
    if (!user) return;

    // Round up to the nearest cent before storing so totals always equal sum of rows
    const storedCostUSD = costUSD > 0 ? Math.ceil(costUSD * 100) / 100 : 0;
    const storedCostEGP = storedCostUSD * USD_TO_EGP;

    const now = new Date();
    const entry = await UsageLog.create({
      userId: user._id,
      userName: user.name,
      operationType,
      model,
      inputTokens,
      outputTokens,
      costUSD: storedCostUSD,
      costEGP: storedCostEGP,
      metadata,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      createdAt: now
    });
  } catch (err) {
    console.error('[UsageLog] Failed to write log:', err.message);
  }
};
