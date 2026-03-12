const PDFGenerator = require('../utils/pdfGenerator');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const sharp = require('sharp'); // Re-added sharp for mathematically perfect colors

// Initialize Gemini with your standard API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Native Signature Processing using Nano Banana 2 + Sharp
 */
/**
 * Native Signature Processing using Nano Banana 2 + Sharp Thresholding
 */
async function processSignature(file, shouldRemove) {
  if (!file) return null;
  
  if (shouldRemove !== 'on') {
    return `data:${file.mimetype || 'image/png'};base64,${file.buffer.toString('base64')}`;
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-image-preview' });

    // STEP 1: Ask for pure white, explicitly forbidding the checkerboard
    const prompt = "Extract the handwritten signature. Thicken the ink to make it clear. Place the signature on a solid, pure white background. DO NOT draw a checkerboard transparency pattern. Output ONLY the image.";

    const imagePart = {
      inlineData: {
        data: file.buffer.toString('base64'),
        mimeType: file.mimetype
      }
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const outputPart = response.candidates[0].content.parts.find(part => part.inlineData);

    if (outputPart && outputPart.inlineData) {
      const aiImageBuffer = Buffer.from(outputPart.inlineData.data, 'base64');

      // STEP 2: Mathematical Perfection with Sharp
      const finalBuffer = await sharp(aiImageBuffer)
        .grayscale()     // Strips away any random purple/blue tints from the AI
        .threshold(220)  // Magic trick: Any pixel lighter than dark gray becomes pure #FFFFFF, the rest becomes pure #000000
        .png()
        .toBuffer();

      return `data:image/png;base64,${finalBuffer.toString('base64')}`;
    }
    
    throw new Error("No image data returned from Nano Banana model.");

  } catch (error) {
    console.error('❌ Signature Error:', error.message);
    return `data:${file.mimetype || 'image/png'};base64,${file.buffer.toString('base64')}`;
  }
}
exports.showForm = (req, res) => {
  res.render('index', { title: 'Generate POA', error: null });
};

exports.generateStandardPDF = async (req, res) => {
  try {
    const { firstName, lastName, address, pnr, date, removeBg, lang } = req.body;
    const files = req.files || [];
    const signatureFile = files.find(f => f.fieldname === 'signature');

    if (!firstName || !lastName || !address || !pnr || !date) {
      return res.render('index', { error: 'All fields are required', formData: req.body });
    }

    const signatureDataUrl = await processSignature(signatureFile, removeBg);
    
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