'use strict';

const cloudinary = require('cloudinary').v2;
const sharp = require('sharp');
const genAI = require('../utils/geminiClient');
const { geminiQueue } = require('../utils/geminiQueue');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const SIG_MODELS = require('../config/models').signature;

/**
 * Unified Signature Processing Engine
 * Returns { dataUrl, inputTokens, outputTokens }.
 * Errors are caught internally and fall back to the raw image - this is intentional.
 */
async function processSignature(file, processingMethod) {
  if (!file) return { dataUrl: null, inputTokens: 0, outputTokens: 0, modelUsed: null };

  const geminiModel = SIG_MODELS[processingMethod];
  if (geminiModel) {
    try {
      const model = genAI.getGenerativeModel({ model: geminiModel });
      const prompt = "Extract the handwritten signature from the image exactly as it appears. Convert the signature to solid black ink on a pure white (#FFFFFF) background. CRITICAL INSTRUCTION: Do NOT redraw, synthesize, or alter the shape of any letters, loops, or strokes. Perform a strict background removal and contrast adjustment and thicken the ink only. You must preserve every original pen stroke exactly as drawn, paying special attention to keep very faint, thin, or light continuous lines from being erased. Do not 'fix' or change the handwriting. DO NOT use a checkerboard transparency pattern. Output ONLY the final image.";
      const imagePart = { inlineData: { data: file.buffer.toString('base64'), mimeType: file.mimetype } };
      const result = await geminiQueue.run(() => model.generateContent([prompt, imagePart]));
      const response = await result.response;
      const { promptTokenCount: inputTokens = 0, candidatesTokenCount: outputTokens = 0 } = response.usageMetadata || {};
      const outputPart = response.candidates[0].content.parts.find(part => part.inlineData);

      if (outputPart && outputPart.inlineData) {
        const aiImageBuffer = Buffer.from(outputPart.inlineData.data, 'base64');
        const finalBuffer = await sharp(aiImageBuffer).grayscale().threshold(220).png().toBuffer();
        return { dataUrl: `data:image/png;base64,${finalBuffer.toString('base64')}`, inputTokens, outputTokens, modelUsed: geminiModel };
      }
      return { dataUrl: `data:${file.mimetype || 'image/png'};base64,${file.buffer.toString('base64')}`, inputTokens, outputTokens, modelUsed: geminiModel };
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

  // Fallback or "none"
  return { dataUrl: `data:${file.mimetype || 'image/png'};base64,${file.buffer.toString('base64')}`, inputTokens: 0, outputTokens: 0, modelUsed: null };
}

module.exports = { processSignature, SIG_MODELS };
