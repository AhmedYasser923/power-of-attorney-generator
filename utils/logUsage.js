const UsageLog = require('../models/UsageLog');

/**
 * Log a cost-generating operation to MongoDB and broadcast to admin dashboard.
 * Fire-and-forget: a failure here never propagates to the main request flow.
 */
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

    // Round up before storing:
    // - Sub-cent costs (<$0.01): round up to nearest $0.001 unit, expressed as cents ($0.01 min)
    //   e.g. $0.001183 → ceil(1.183)/100 = $0.02; $0.000500 → $0.01 (minimum)
    // - At or above $0.01: round up to nearest cent
    let storedCostUSD = 0;
    if (costUSD > 0) {
      if (costUSD < 0.01) {
        storedCostUSD = Math.max(0.01, Math.ceil(costUSD * 1000) / 100);
      } else {
        storedCostUSD = Math.ceil(costUSD * 100) / 100;
      }
    }

    const now = new Date();
    const entry = await UsageLog.create({
      userId: user._id,
      userName: user.name,
      operationType,
      model,
      inputTokens,
      outputTokens,
      costUSD: storedCostUSD,
      metadata,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      createdAt: now
    });
  } catch (err) {
    console.error('[UsageLog] Failed to write log:', err.message);
  }
};
