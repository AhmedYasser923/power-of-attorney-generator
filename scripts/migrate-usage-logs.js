require('dotenv').config({ path: '../config.env' });
const mongoose = require('mongoose');
const UsageLog = require('../models/UsageLog');

async function migrate() {
  try {
    await mongoose.connect(process.env.DATABASE);
    console.log('Connected to MongoDB');

    // ── Part A: reclassify Gemini-Lufthansa records ──────────────────────
    const reclassifyResult = await UsageLog.updateMany(
      {
        operationType: 'poa_lufthansa',
        model: 'gemini-3-pro-image-preview'
      },
      {
        $set: { operationType: 'sig_processing' }
      }
    );
    console.log(`Part A: Reclassified ${reclassifyResult.modifiedCount} records`
      + ' poa_lufthansa+gemini → sig_processing');

    // ── Part B: recalculate costEGP for all records with costUSD > 0 ─────
    // Use $set with aggregation pipeline (MongoDB 4.2+) to compute inline.
    const recalcResult = await UsageLog.updateMany(
      { costUSD: { $gt: 0 } },
      [
        {
          $set: {
            costEGP: {
              $divide: [
                {
                  $ceil: {
                    $multiply: [
                      { $multiply: ['$costUSD', 54.33] },
                      100
                    ]
                  }
                },
                100
              ]
            }
          }
        }
      ]
    );
    console.log(`Part B: Recalculated costEGP for ${recalcResult.modifiedCount} records`
      + ' (rate 53 → 54.33)');

    await mongoose.disconnect();
    console.log('Migration complete. Disconnected.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
