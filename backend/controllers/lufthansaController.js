const PDFGenerator = require('../utils/pdfGenerator');
const path = require('path');
const fs = require('fs');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const logUsage = require('../utils/logUsage');
const { processSignature } = require('../services/signatureService');

function getLufthansaLogoBase64() {
  try {
    const logoPath = path.join(__dirname, '../public/images/Lufthansa_Logo_2018.svg.png');
    if (!fs.existsSync(logoPath)) return null;
    const logoBuffer = fs.readFileSync(logoPath);
    return `data:image/png;base64,${logoBuffer.toString('base64')}`;
  } catch(e) {
    return null;
  }
}

const { MODEL_PRICING } = require('../utils/pricing');

function capitalizeWords(str) {
  if (!str) return '';
  return str.trim().split(/\s+/).map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

exports.generateLufthansaPDF = catchAsync(async (req, res, next) => {
  const { pnr, flightDate, claimDate, flightNumber, bookingCode } = req.body;
  const files = req.files || [];

  const signatureFiles = files.filter(f => f.fieldname && f.fieldname.toLowerCase().includes('signature'));
  const sigUsageRecords = [];
  let sigIndex = 0;

  // Collect passenger data (parse only, no processing yet)
  const passengerTasks = [];
  for (let i = 1; i <= 4; i++) {
    const rawName = req.body[`fullName${i}`] || '';
    const signatureFile = signatureFiles[sigIndex];

    if (rawName.trim() || signatureFile) {
      let firstName = '';
      let lastName = '';

      if (rawName.trim()) {
        const nameParts = rawName.trim().split(/\s+/);
        if (nameParts.length === 1) {
          firstName = capitalizeWords(nameParts[0]);
        } else {
          firstName = capitalizeWords(nameParts.shift());
          lastName = capitalizeWords(nameParts.join(' '));
        }
      }

      if (signatureFile) sigIndex++;

      const sigProcessing = req.body[`sigProcessing${i}`];
      passengerTasks.push({
        i,
        firstName,
        lastName,
        address: req.body[`address${i}`] || '',
        signatureFile,
        sigProcessing
      });
    }
  }

  if (passengerTasks.length === 0) {
    return next(new AppError('At least one passenger or signature is required.', 400));
  }

  // Flush headers immediately — keeps Cloud Run's load balancer connection alive
  // while Gemini processes signatures (which can take a long time)
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=lufthansa-poa-${pnr}.pdf`);
  res.flushHeaders();

  // Process all signatures in parallel
  const sigResults = await Promise.all(passengerTasks.map(t => processSignature(t.signatureFile, t.sigProcessing)));

  const passengers = passengerTasks.map((task, idx) => {
    const { dataUrl: signatureDataUrl, inputTokens: sigIn, outputTokens: sigOut, modelUsed } = sigResults[idx];
    if (modelUsed) {
      const rates = MODEL_PRICING[modelUsed];
      const costUSD = rates ? (sigIn / 1_000_000) * rates.input + (sigOut / 1_000_000) * rates.output : 0;
      sigUsageRecords.push({ sigNum: task.i, model: modelUsed, inputTokens: sigIn, outputTokens: sigOut, costUSD });
    }
    return {
      firstName: task.firstName,
      lastName: task.lastName,
      fullName: task.lastName ? `${task.lastName}, ${task.firstName}` : (task.firstName || ' '),
      address: task.address,
      signature: signatureDataUrl
    };
  });

  const pdfData = {
    pnr, flightDate: new Date(flightDate), claimDate: new Date(claimDate),
    flightNumber: flightNumber || pnr, bookingCode: bookingCode || pnr,
    passengers, lufthansaLogo: getLufthansaLogoBase64()
  };

  const pdfBuffer = await PDFGenerator.generatePOA(req.app, pdfData, 'lufthansa-poa');

  if (sigUsageRecords.length > 0) {
    for (const rec of sigUsageRecords) {
      console.log(`\n[SIG_PROCESSING] Lufthansa POA — Signature #${rec.sigNum}`);
      console.log(`  Model: ${rec.model}`);
      console.log(`  Input Tokens: ${rec.inputTokens.toLocaleString()}`);
      console.log(`  Output Tokens: ${rec.outputTokens.toLocaleString()}`);
      console.log(`  Cost (USD): $${rec.costUSD.toFixed(6)}`);
      console.log(`  PNR: ${pnr}\n`);

      logUsage(req, {
        operationType: 'sig_processing',
        model: rec.model,
        inputTokens: rec.inputTokens,
        outputTokens: rec.outputTokens,
        costUSD: rec.costUSD,
        metadata: { pnr, passengerCount: passengers.length, signatureNum: rec.sigNum }
      });
    }
  } else {
    // Free POA generation (no Gemini signature processing)
    logUsage(req, {
      operationType: 'poa_lufthansa',
      metadata: { pnr, passengerCount: passengers.length }
    });
  }

  res.end(pdfBuffer);
});
