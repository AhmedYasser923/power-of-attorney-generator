'use strict';

// Google Gemini API pricing — per 1 million tokens (USD).
// Source: https://ai.google.dev/pricing
// Last verified: 2026-04-13
const MODEL_PRICING = {
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },
  'gemini-3-flash-preview': { input: 0.50, output: 3.00 },
  'gemini-2.5-flash-image': { input: 0.30, output: 60.00 },
  'gemini-3-pro-image-preview': { input: 2.00, output: 120.00 },
  'gemini-3.1-flash-image-preview': { input: 0.50, output: 60.00 },
  'gemini-3.1-flash-lite-preview': { input: 0.25, output: 1.50 },
};

/**
 * Calculate cost from Gemini usageMetadata and model name.
 * Thinking tokens (thoughtsTokenCount) are billed at the output rate.
 * Returns raw USD with no rounding.
 */
function calculateCost(model, usageMetadata) {
  const rates = MODEL_PRICING[model];
  if (!rates || !usageMetadata) return { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, costUSD: 0 };

  const inputTokens = usageMetadata.promptTokenCount || 0;
  const outputTokens = usageMetadata.candidatesTokenCount || 0;
  const thinkingTokens = usageMetadata.thoughtsTokenCount || 0;

  const costUSD =
    (inputTokens / 1_000_000) * rates.input +
    ((outputTokens + thinkingTokens) / 1_000_000) * rates.output;

  return { inputTokens, outputTokens, thinkingTokens, costUSD };
}

module.exports = { MODEL_PRICING, calculateCost };
