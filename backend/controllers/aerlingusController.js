const PDFGenerator = require('../utils/pdfGenerator');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const logUsage = require('../utils/logUsage');
const { processSignature } = require('../services/signatureService');
const { sanitizeFilenameComponent } = require('../utils/sanitize');

const { MODEL_PRICING } = require('../utils/pricing');

exports.generateAerLingusPDF = catchAsync(async (req, res, next) => {
  const { firstName, lastName, address, pnr, caseNumber, claimType, flightDate, flightNumber, route, sigProcessing } = req.body;
  const files = req.files || [];
  const signatureFile = files.find(f => f.fieldname === 'signature');

  if (!firstName || !lastName || !pnr) {
    return next(new AppError('First Name, Last Name, and PNR are required.', 400));
  }

  const safeFirstName = sanitizeFilenameComponent(firstName, 'passenger');
  const safeLastName = sanitizeFilenameComponent(lastName, 'document');
  const fileName = `AerLingus_POA_${safeFirstName}_${safeLastName}.pdf`;

  // Flush headers immediately — keeps Cloud Run's load balancer connection alive
  // while Gemini processes the signature (which can take a long time)
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.flushHeaders();

  const { dataUrl: signatureDataUrl, inputTokens: sigIn, outputTokens: sigOut, modelUsed } = await processSignature(signatureFile, sigProcessing);
  const sigRates = MODEL_PRICING[modelUsed];
  const sigCostUSD = sigRates ? (sigIn / 1_000_000) * sigRates.input + (sigOut / 1_000_000) * sigRates.output : 0;

  const pdfData = {
    firstName, lastName, address, pnr, caseNumber, claimType,
    flightDate: new Date(flightDate), flightNumber, route,
    signature: signatureDataUrl
  };

  const pdfBuffer = await PDFGenerator.generatePOA(req.app, pdfData, 'aerlingus-poa');

  if (modelUsed) {
    console.log(`\n[SIG_PROCESSING] Aer Lingus POA`);
    console.log(`  Model: ${modelUsed}`);
    console.log(`  Input Tokens: ${sigIn.toLocaleString()}`);
    console.log(`  Output Tokens: ${sigOut.toLocaleString()}`);
    console.log(`  Cost (USD): $${sigCostUSD.toFixed(6)}`);
    console.log(`  Flight: ${flightNumber}`);
    console.log(`  PNR: ${pnr}\n`);

    logUsage(req, {
      operationType: 'sig_processing',
      model: modelUsed,
      inputTokens: sigIn,
      outputTokens: sigOut,
      costUSD: sigCostUSD,
      metadata: { pnr, flightNumber }
    });
  } else {
    // Free POA generation (no Gemini signature processing)
    logUsage(req, {
      operationType: 'poa_aerlingus',
      metadata: { pnr, flightNumber }
    });
  }

  res.end(pdfBuffer);
});
