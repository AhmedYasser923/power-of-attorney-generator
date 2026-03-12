const PDFGenerator = require('../utils/pdfGenerator');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cloudinary = require('cloudinary').v2;
const sharp = require('sharp');

// Initialize APIs
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Unified Signature Processing Engine
 */
async function processSignature(file, processingMethod) {
  if (!file) return null;

  if (processingMethod === 'gemini') {
    try {
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
    } catch (error) {
      console.error('❌ Gemini Signature Error:', error.message);
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
      return `data:image/png;base64,${Buffer.from(arrayBuffer).toString('base64')}`;
    } catch (error) {
      console.error('❌ Cloudinary Error:', error.message);
    }
  }

  // Fallback or "none"
  return `data:${file.mimetype || 'image/png'};base64,${file.buffer.toString('base64')}`;
}

exports.showForm = (req, res) => {
  res.render('index', { title: 'Generate POA', error: null });
};

exports.generateStandardPDF = async (req, res) => {
  try {
    const { firstName, lastName, address, pnr, date, sigProcessing, lang } = req.body;
    const files = req.files || [];
    const signatureFile = files.find(f => f.fieldname === 'signature');

    if (!firstName || !lastName || !address || !pnr || !date) {
      return res.render('index', { error: 'All fields are required', formData: req.body });
    }

    const signatureDataUrl = await processSignature(signatureFile, sigProcessing);
    
    const pdfData = { firstName, lastName, address, pnr, date: new Date(date), signature: signatureDataUrl };
    
    const langCode = lang || 'En';
    const templateName = langCode === 'En' ? 'assignment-pdf' : `assignment-${langCode.toLowerCase()}-pdf`;

    const safeFirstName = firstName.replace(/[^\x00-\x7F]/g, "").trim();
    const safeLastName = lastName.replace(/[^\x00-\x7F]/g, "").trim();
    
    const passengerName = `${safeFirstName}_${safeLastName}`;
    const fileName = `Assignment-${langCode}_${passengerName}.pdf`;

    const pdfBuffer = await PDFGenerator.generatePOA(req.app, pdfData, templateName);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('❌ Error generating Standard PDF:', error);
    res.status(500).render('error', { message: 'Error generating PDF.' });
  }
};