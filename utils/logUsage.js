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

    const now = new Date();
    // Egypt is permanently UTC+2 (no DST since 2011)
    const egyptNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const entry = await UsageLog.create({
      userId: user._id,
      userName: user.name,
      operationType,
      model,
      inputTokens,
      outputTokens,
      costUSD,
      metadata,
      year: egyptNow.getUTCFullYear(),
      month: egyptNow.getUTCMonth() + 1,
      createdAt: now
    });
  } catch (err) {
    console.error('[UsageLog] Failed to write log:', err.message);
  }
};
