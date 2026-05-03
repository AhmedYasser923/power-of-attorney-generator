'use strict';

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', 'config.env') });

const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const Announcement = require('../models/Announcement');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function stripHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanLabel(value) {
  return String(value || '').trim().replace(/^["']|["']$/g, '').replace(/[<>]/g, '').slice(0, 40) || 'General';
}

async function main() {
  if (!process.env.DATABASE) {
    throw new Error('DATABASE is missing from config.env.');
  }
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing from config.env.');
  }

  await mongoose.connect(process.env.DATABASE);
  console.log('Connected to DB.');

  const announcements = await Announcement.find().sort({ date: -1, createdAt: -1 }).lean();
  if (!announcements.length) {
    console.log('No announcements found.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${announcements.length} announcements. Asking AI to relabel...`);

  const batchText = announcements.map((announcement, index) =>
    `[${index + 1}] "${stripHtml(announcement.content).slice(0, 240)}"`
  ).join('\n');

  const prompt = `You are a categorization assistant. Below are ${announcements.length} announcement texts. Assign each one a short category label (1-3 words, Title Case). Group similar announcements under the same label.

ANNOUNCEMENTS:
${batchText}

Return a JSON array of strings, one label per announcement, in the same order. Example: ["Policy Update","Schedule Change","Policy Update"]
Return ONLY the JSON array - no explanation, no code fences.`;

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim().replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');

  let labels;
  try {
    labels = JSON.parse(raw);
  } catch (err) {
    console.error('AI returned invalid JSON:', raw);
    process.exitCode = 1;
    await mongoose.disconnect();
    return;
  }

  if (!Array.isArray(labels) || labels.length !== announcements.length) {
    console.error(`Expected ${announcements.length} labels, got ${Array.isArray(labels) ? labels.length : 'non-array'}.`);
    process.exitCode = 1;
    await mongoose.disconnect();
    return;
  }

  const ops = announcements.map((announcement, index) => ({
    updateOne: {
      filter: { _id: announcement._id },
      update: { $set: { subject: cleanLabel(labels[index]) } },
    },
  }));

  await Announcement.bulkWrite(ops);

  console.log('Done. New labels:');
  labels.forEach((label, index) => console.log(`  [${index + 1}] ${cleanLabel(label)}`));
  await mongoose.disconnect();
}

main().catch(async err => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (disconnectErr) {
    // Ignore disconnect errors during failure handling.
  }
  process.exit(1);
});
