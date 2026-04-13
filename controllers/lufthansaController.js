const PDFGenerator = require('../utils/pdfGenerator');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cloudinary = require('cloudinary').v2;
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const logUsage = require('../utils/logUsage');

// Initialize APIs
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

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

/**
 * Unified Signature Processing Engine
 * Returns { dataUrl, inputTokens, outputTokens }.
 * Errors are caught internally and fall back to the raw image — this is intentional.
 */
async function processSignature(file, processingMethod) {
  if (!file) return { dataUrl: null, inputTokens: 0, outputTokens: 0 };

  if (processingMethod === 'gemini') {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-image-preview' });
      const prompt = "Extract the handwritten signature from the image exactly as it appears. Convert the signature to solid black ink on a pure white (#FFFFFF) background. CRITICAL INSTRUCTION: Do NOT redraw, synthesize, or alter the shape of any letters, loops, or strokes. Perform a strict background removal and contrast adjustment and thicken the ink only. You must preserve every original pen stroke exactly as drawn, paying special attention to keep very faint, thin, or light continuous lines from being erased. Do not 'fix' or change the handwriting. DO NOT use a checkerboard transparency pattern. Output ONLY the final image.";
      const imagePart = { inlineData: { data: file.buffer.toString('base64'), mimeType: file.mimetype } };
      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;
      const { promptTokenCount: inputTokens = 0, candidatesTokenCount: outputTokens = 0 } = response.usageMetadata || {};
      const outputPart = response.candidates[0].content.parts.find(part => part.inlineData);

      if (outputPart && outputPart.inlineData) {
        const aiImageBuffer = Buffer.from(outputPart.inlineData.data, 'base64');
        const finalBuffer = await sharp(aiImageBuffer).grayscale().threshold(220).png().toBuffer();
        return { dataUrl: `data:image/png;base64,${finalBuffer.toString('base64')}`, inputTokens, outputTokens };
      }
      return { dataUrl: `data:${file.mimetype || 'image/png'};base64,${file.buffer.toString('base64')}`, inputTokens, outputTokens };
    } catch (error) {
      console.error('Gemini Signature Error:', error.message);
    }
  } else if (processingMethod === 'cloudinary') {
    try {
      const enlargedBuffer = await sharp(file.buffer).resize({ width: 1000, withoutEnlargement: false }).png().toBuffer();
      const base64Image = `data:image/png;base64,${enlargedBuffer.toString('base64')}`;
      const result = await cloudinary.uploader.upload(base64Image, { folder: 'poa_signatures', background_removal: 'cloudinary_ai' });
      const url = cloudinary.url(result.public_id, { secure: true, effect: "background_removal", transformation: [{ effect: "improve" }] });
      const response = await fetch(url);
      if (!response.ok) throw new Error('Cloudinary fetch failed');
      const arrayBuffer = await response.arrayBuffer();
      return { dataUrl: `data:image/png;base64,${Buffer.from(arrayBuffer).toString('base64')}`, inputTokens: 0, outputTokens: 0 };
    } catch (error) {
      console.error('Cloudinary Error:', error.message);
    }
  }

  return { dataUrl: `data:${file.mimetype || 'image/png'};base64,${file.buffer.toString('base64')}`, inputTokens: 0, outputTokens: 0 };
}

function capitalizeWords(str) {
  if (!str) return '';
  return str.trim().split(/\s+/).map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

exports.preview = catchAsync(async (req, res, next) => {
  const dummyData = {
    flightNumber: 'LH982', bookingCode: 'xcwgia',
    formattedFlightDate: new Date().toLocaleDateString('en-GB').replace(/\//g, '-'),
    formattedClaimDate: new Date().toLocaleDateString('en-GB').replace(/\//g, '-'),
    lufthansaLogo: getLufthansaLogoBase64(),
    passengers: [
      { fullName: 'Nelson, Pamela', address: 'Feldstraße, 14, Wiesbaden, 65183, Hessen, Germany', signature: null },
      { fullName: 'Yasser Ali, Ahmed', address: 'Dagsverksvägen, Stockholm 16355, Sweden', signature: null }
    ]
  };
  res.render('lufthansa-poa', dummyData);
});

exports.generateLufthansaPDF = catchAsync(async (req, res, next) => {
  const { pnr, flightDate, claimDate, flightNumber, bookingCode } = req.body;
  const files = req.files || [];

  const signatureFiles = files.filter(f => f.fieldname && f.fieldname.toLowerCase().includes('signature'));
  const passengers = [];
  let sigIndex = 0;
  let totalSigIn = 0, totalSigOut = 0;
  let usedGemini = false;

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
      const { dataUrl: signatureDataUrl, inputTokens: sigIn, outputTokens: sigOut } = await processSignature(signatureFile, sigProcessing);
      totalSigIn += sigIn;
      totalSigOut += sigOut;
      if (sigProcessing === 'gemini') usedGemini = true;

      passengers.push({
        firstName,
        lastName,
        fullName: lastName ? `${lastName}, ${firstName}` : (firstName || ' '),
        address: req.body[`address${i}`] || '',
        signature: signatureDataUrl
      });
    }
  }

  if (passengers.length === 0) {
    return next(new AppError('At least one passenger or signature is required.', 400));
  }

  const pdfData = {
    pnr, flightDate: new Date(flightDate), claimDate: new Date(claimDate),
    flightNumber: flightNumber || pnr, bookingCode: bookingCode || pnr,
    passengers, lufthansaLogo: getLufthansaLogoBase64()
  };

  const pdfBuffer = await PDFGenerator.generatePOA(req.app, pdfData, 'lufthansa-poa');

  if (usedGemini) {
    const sigCostUSD = (totalSigIn / 1_000_000) * 0.075 + (totalSigOut / 1_000_000) * 0.30;
    const storedCostUSD = sigCostUSD > 0 ? (sigCostUSD < 0.01 ? Math.max(0.01, Math.ceil(sigCostUSD * 1000) / 100) : Math.ceil(sigCostUSD * 100) / 100) : 0;
    console.log(`\n[SIG_PROCESSING] Lufthansa POA`);
    console.log(`  Input Tokens: ${totalSigIn.toLocaleString()}`);
    console.log(`  Output Tokens: ${totalSigOut.toLocaleString()}`);
    console.log(`  Cost (USD): $${sigCostUSD.toFixed(6)} → $${storedCostUSD.toFixed(2)} (rounded)`);
    console.log(`  Passengers: ${passengers.length}`);
    console.log(`  PNR: ${pnr}\n`);

    await logUsage(req, {
      operationType: 'sig_processing',
      model: 'gemini-3-pro-image-preview',
      inputTokens: totalSigIn,
      outputTokens: totalSigOut,
      costUSD: sigCostUSD,
      metadata: { pnr, passengerCount: passengers.length }
    });
  } else {
    // Free POA generation (no Gemini signature processing)
    await logUsage(req, {
      operationType: 'poa_lufthansa',
      metadata: { pnr, passengerCount: passengers.length }
    });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=lufthansa-poa-${pnr}.pdf`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
});
