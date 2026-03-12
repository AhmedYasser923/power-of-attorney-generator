const PDFGenerator = require('../utils/pdfGenerator');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cloudinary = require('cloudinary').v2;
const sharp = require('sharp');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

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

exports.generateAerLingusPDF = async (req, res) => {
  try {
    const { firstName, lastName, address, pnr, caseNumber, claimType, flightDate, flightNumber, route, sigProcessing } = req.body;
    const files = req.files || [];
    const signatureFile = files.find(f => f.fieldname === 'signature');

    if (!firstName || !lastName || !pnr) return res.status(400).send('First Name, Last Name, and PNR are required.');

    const signatureDataUrl = await processSignature(signatureFile, sigProcessing);
    
    const pdfData = { 
      firstName, lastName, address, pnr, caseNumber, claimType, 
      flightDate: new Date(flightDate), flightNumber, route, 
      signature: signatureDataUrl 
    };
    
    const passengerName = `${firstName}_${lastName}`;
    const fileName = `AerLingus_POA_${passengerName}.pdf`;

    const pdfBuffer = await PDFGenerator.generatePOA(req.app, pdfData, 'aerlingus-poa');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('❌ Error generating Aer Lingus PDF:', error);
    res.status(500).render('error', { message: 'Error generating PDF.' });
  }
};