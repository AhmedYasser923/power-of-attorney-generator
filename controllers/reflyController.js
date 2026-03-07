const PDFGenerator = require('../utils/pdfGenerator');
const PowerOfAttorney = require('../models/PowerOfAttorney');
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

exports.showForm = (req, res) => {
  res.render('index', { title: 'Generate POA', error: null });
};

exports.listRecords = async (req, res) => {
  try {
    const records = await PowerOfAttorney.find().sort({ createdAt: -1 });
    res.render('records', { title: 'Records', records });
  } catch (error) {
    res.status(500).render('error', { message: 'Error fetching records' });
  }
};

exports.generateStandardPDF = async (req, res) => {
  try {
    // Extract lang from req.body
    const { firstName, lastName, address, pnr, date, removeBg, lang } = req.body;
    const files = req.files || [];
    const signatureFile = files.find(f => f.fieldname === 'signature');

    if (!firstName || !lastName || !address || !pnr || !date) {
      return res.render('index', { error: 'All fields are required', formData: req.body });
    }

    const signatureDataUrl = await processSignature(signatureFile, removeBg);
    const pdfData = { firstName, lastName, address, pnr, date: new Date(date), signature: signatureDataUrl };
    
    // Determine the template and language code for the filename
    const langCode = lang || 'En';
    const templateName = langCode === 'En' ? 'assignment-pdf' : `assignment-${langCode.toLowerCase()}-pdf`;

    // Construct the filename using convention: Assignment_form_{Lang}_{FirstName}_{LastName}.pdf
    const passengerName = `${firstName}_${lastName}`;
    const fileName = `Assignment-${langCode}_${passengerName}.pdf`;

    const pdfBuffer = await PDFGenerator.generatePOA(req.app, pdfData, templateName);

    res.setHeader('Content-Type', 'application/pdf');
    // Set the specific dynamic filename in the header
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('❌ Error generating Standard PDF:', error);
    res.status(500).render('error', { message: 'Error generating PDF.' });
  }
};