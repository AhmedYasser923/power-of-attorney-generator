const PDFGenerator = require('../utils/pdfGenerator');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cloudinary = require('cloudinary').v2;
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

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

// --- HELPER: GEMINI AI ---
async function runGemini(file) {
  const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-image-preview' });
  const prompt = "Extract the handwritten signature. Thicken the ink to make it clear. Place the signature on a solid, pure white background. DO NOT draw a checkerboard transparency pattern. Output ONLY the image.";
  const imagePart = { inlineData: { data: file.buffer.toString('base64'), mimeType: file.mimetype } };
  const result = await model.generateContent([prompt, imagePart]);
  const response = await result.response;
  const outputPart = response.candidates[0].content.parts.find(part => part.inlineData);

  if (outputPart && outputPart.inlineData) {
    const aiImageBuffer = Buffer.from(outputPart.inlineData.data, 'base64');
    const finalBuffer = await sharp(aiImageBuffer).grayscale().threshold(220).png().toBuffer();
    return `data:image/png;base64,${finalBuffer.toString('base64')}`;
  }
  throw new Error("No valid image data returned from Gemini.");
}

// --- HELPER: CLOUDINARY AI ---
async function runCloudinary(file) {
  const enlargedBuffer = await sharp(file.buffer).resize({ width: 1000, withoutEnlargement: false }).png().toBuffer();
  const base64Image = `data:image/png;base64,${enlargedBuffer.toString('base64')}`;
  const result = await cloudinary.uploader.upload(base64Image, { folder: 'poa_signatures', background_removal: 'cloudinary_ai' });
  const url = cloudinary.url(result.public_id, { secure: true, effect: "background_removal", transformation: [{ effect: "improve" }] });
  
  const response = await fetch(url);
  if (!response.ok) throw new Error('Cloudinary fetch failed');
  const arrayBuffer = await response.arrayBuffer();
  return `data:image/png;base64,${Buffer.from(arrayBuffer).toString('base64')}`;
}

async function processSignature(file, processingMethod) {
  if (!file) return null;

  if (processingMethod === 'gemini') {
    try {
      return await runGemini(file);
    } catch (error) {
      console.warn('⚠️ Gemini Signature Error. Falling back to Cloudinary:', error.message);
      try {
        return await runCloudinary(file);
      } catch (fallbackError) {
        console.error('❌ Cloudinary Fallback Error. Using Raw Image:', fallbackError.message);
      }
    }
  } else if (processingMethod === 'cloudinary') {
    try {
      return await runCloudinary(file);
    } catch (error) {
      console.warn('⚠️ Cloudinary Error. Falling back to Gemini:', error.message);
      try {
        return await runGemini(file);
      } catch (fallbackError) {
        console.error('❌ Gemini Fallback Error. Using Raw Image:', fallbackError.message);
      }
    }
  }

  return `data:${file.mimetype || 'image/png'};base64,${file.buffer.toString('base64')}`;
}

function capitalizeWords(str) {
  if (!str) return '';
  return str.trim().split(/\s+/).map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

exports.preview = (req, res) => {
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
};

exports.generateLufthansaPDF = async (req, res) => {
  try {
    const { pnr, flightDate, claimDate, flightNumber, bookingCode } = req.body;
    const files = req.files || [];

    const signatureFiles = files.filter(f => f.fieldname && f.fieldname.toLowerCase().includes('signature'));
    const passengers = [];
    let sigIndex = 0;

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
        const signatureDataUrl = await processSignature(signatureFile, sigProcessing);

        passengers.push({
          firstName,
          lastName,
          fullName: lastName ? `${lastName}, ${firstName}` : (firstName || ' '),
          address: req.body[`address${i}`] || '',
          signature: signatureDataUrl
        });
      }
    }

    if (passengers.length === 0) return res.status(400).send("At least one passenger or signature is required.");

    const pdfData = {
      pnr, flightDate: new Date(flightDate), claimDate: new Date(claimDate),
      flightNumber: flightNumber || pnr, bookingCode: bookingCode || pnr,
      passengers, lufthansaLogo: getLufthansaLogoBase64()
    };

    const pdfBuffer = await PDFGenerator.generatePOA(req.app, pdfData, 'lufthansa-poa');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=lufthansa-poa-${pnr}.pdf`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('❌ Error generating Lufthansa PDF:', error);
    res.status(500).render('error', { message: 'Error generating PDF.' });
  }
};