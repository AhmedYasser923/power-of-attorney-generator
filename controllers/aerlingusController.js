const PDFGenerator = require('../utils/pdfGenerator');
const cloudinary = require('cloudinary').v2;
const sharp = require('sharp');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function processSignature(file, shouldRemove) {
  if (!file) return null;
  if (shouldRemove !== 'on') {
    return `data:${file.mimetype || 'image/png'};base64,${file.buffer.toString('base64')}`;
  }
  try {
    const enlargedBuffer = await sharp(file.buffer).resize({ width: 1000, withoutEnlargement: false }).png().toBuffer();
    const base64Image = `data:image/png;base64,${enlargedBuffer.toString('base64')}`;
    const result = await cloudinary.uploader.upload(base64Image, { folder: 'poa_signatures', background_removal: 'cloudinary_ai' });
    const url = cloudinary.url(result.public_id, { secure: true, effect: "background_removal", transformation: [{ effect: "improve" }] });
    const response = await fetch(url);
    if (!response.ok) throw new Error('Fetch failed');
    const arrayBuffer = await response.arrayBuffer();
    return `data:image/png;base64,${Buffer.from(arrayBuffer).toString('base64')}`;
  } catch (error) {
    console.error('❌ Cloudinary error:', error.message);
    return `data:${file.mimetype || 'image/png'};base64,${file.buffer.toString('base64')}`;
  }
}

exports.generateAerLingusPDF = async (req, res) => {
  try {
    const { firstName, lastName, address, pnr, caseNumber, claimType, flightDate, flightNumber, route, removeBg } = req.body;
    const files = req.files || [];
    const signatureFile = files.find(f => f.fieldname === 'signature');

    if (!firstName || !lastName || !pnr) {
      return res.status(400).send('First Name, Last Name, and PNR are required.');
    }

    const signatureDataUrl = await processSignature(signatureFile, removeBg);
    
    const pdfData = { 
      firstName, lastName, address, pnr, caseNumber, claimType, 
      flightDate: new Date(flightDate), 
      flightNumber, route, 
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