const PDFGenerator = require('../utils/pdfGenerator');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const logUsage = require('../utils/logUsage');
const { processSignature } = require('../services/signatureService');

const { MODEL_PRICING } = require('../utils/pricing');

exports.generateStandardPDF = catchAsync(async (req, res, next) => {
  const { firstName, lastName, address, pnr, date, sigProcessing, lang } = req.body;
  const files = req.files || [];
  const signatureFile = files.find(f => f.fieldname === 'signature');

  // Form validation — render back to form with the error (better UX than error page)
  if (!firstName || !lastName || !address || !pnr || !date) {
    return res.render('index', { error: 'All fields are required', formData: req.body });
  }

  const langCode = lang || 'En';
  const safeFirstName = firstName.replace(/[^\x00-\x7F]/g, "").trim();
  const safeLastName = lastName.replace(/[^\x00-\x7F]/g, "").trim();
  const fileName = `Assignment-${langCode}_${safeFirstName}_${safeLastName}.pdf`;

  // Flush headers immediately — keeps Cloud Run's load balancer connection alive
  // while Gemini processes the signature (which can take a long time)
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.flushHeaders();

  const { dataUrl: signatureDataUrl, inputTokens: sigIn, outputTokens: sigOut, modelUsed } = await processSignature(signatureFile, sigProcessing);
  const sigRates = MODEL_PRICING[modelUsed];
  const sigCostUSD = sigRates ? (sigIn / 1_000_000) * sigRates.input + (sigOut / 1_000_000) * sigRates.output : 0;

  const pdfData = { firstName, lastName, address, pnr, date: new Date(date), signature: signatureDataUrl };

  const templateName = langCode === 'En' ? 'assignment-pdf' : `assignment-${langCode.toLowerCase()}-pdf`;

  const pdfBuffer = await PDFGenerator.generatePOA(req.app, pdfData, templateName);

  if (modelUsed) {
    console.log(`\n[SIG_PROCESSING] Standard POA`);
    console.log(`  Model: ${modelUsed}`);
    console.log(`  Input Tokens: ${sigIn.toLocaleString()}`);
    console.log(`  Output Tokens: ${sigOut.toLocaleString()}`);
    console.log(`  Cost (USD): $${sigCostUSD.toFixed(6)}`);
    console.log(`  Language: ${langCode}`);
    console.log(`  PNR: ${pnr}\n`);

    logUsage(req, {
      operationType: 'sig_processing',
      model: modelUsed,
      inputTokens: sigIn,
      outputTokens: sigOut,
      costUSD: sigCostUSD,
      metadata: { pnr, lang: langCode }
    });
  } else {
    // Free POA generation (no Gemini signature processing)
    logUsage(req, {
      operationType: 'poa_standard',
      metadata: { pnr, lang: langCode }
    });
  }

  res.end(pdfBuffer);
});
