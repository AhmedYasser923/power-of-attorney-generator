const UsageLog = require('../models/UsageLog');

/**
 * Log a cost-generating operation to MongoDB and broadcast to admin dashboard.
 * Fire-and-forget: a failure here never propagates to the main request flow.
 */
const USD_TO_EGP = 54.33;

module.exports = async function logUsage(req, {
  operationType,
  model = null,
  inputTokens = 0,
  outputTokens = 0,
  costUSD = 0,
  costEGP = null,
  metadata = {}
} = {}) {
  try {
    const user = req.user;
    if (!user) return;

    // Round up to the nearest cent before storing so totals always equal sum of rows
    const storedCostUSD = costUSD > 0 ? Math.ceil(costUSD * 100) / 100 : 0;
    // Use caller-supplied EGP if provided; otherwise derive from stored USD
    const storedCostEGP = (costEGP != null && costEGP > 0)
      ? Math.ceil(costEGP * 100) / 100
      : storedCostUSD * USD_TO_EGP;

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
