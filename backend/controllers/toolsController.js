'use strict';

const airportsDatabase = require('../airports_data.json');
const EmailTemplate    = require('../models/EmailTemplate');
const catchAsync = require('../utils/catchAsync');
const AppError   = require('../utils/appError');
const logUsage   = require('../utils/logUsage');
const { calculateCost } = require('../utils/pricing');
const genAI = require('../utils/geminiClient');
const flightStatusService = require('../services/flightStatusService');
const eocService = require('../services/eocService');

const EmailReference   = require('../models/EmailReference');

const MAX_REFERENCES = 3;
const MAX_REFERENCE_WORDS = 2000;

// ---------------------------------------------------------------------------
// Template state builder — creates an optimized lookup structure
// ---------------------------------------------------------------------------

function buildEmailTemplateState(docs) {
  const byKey = {};

  docs.forEach(t => {
    const key = String(t.key || '').trim();
    if (!key) return;
    byKey[key] = {
      key,
      text: t.text || '',
      type: t.type,
      label: t.label || key,
      combineWithDocuments: !!t.combineWithDocuments,
    };
  });

  const linkTemplateKeys = new Set();
  Object.values(byKey).forEach(t => {
    if (t.type !== 'rejection' && (t.text || '').includes('[link]')) {
      linkTemplateKeys.add(t.key);
    }
  });

  return {
    byKey,
    linkTemplateKeys,
    templates: Object.values(byKey),
  };
}

async function getEmailTemplateState() {
  const docs = await EmailTemplate.find().lean();
  return buildEmailTemplateState(docs);
}

async function getEmailTemplateList() {
  const state = await getEmailTemplateState();
  return state.templates;
}

// ---------------------------------------------------------------------------
// Template CRUD helpers
// ---------------------------------------------------------------------------

function buildTemplateDocument(body) {
  const key = String(body.key || '').trim();
  const label = String(body.label || '').trim();
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const type = body.type || 'document-request';
  const combineWithDocuments = type === 'special-case' ? !!body.combineWithDocuments : false;

  return { key, label: label || key, text, type, combineWithDocuments };
}

function buildTemplateUpdate(body) {
  const update = {};
  if (body.text !== undefined) update.text = String(body.text || '').trim();
  if (body.label !== undefined) update.label = String(body.label || '').trim();

  if (body.type !== undefined) {
    update.type = body.type;
    update.combineWithDocuments = body.type === 'special-case' ? !!body.combineWithDocuments : false;
  } else if (body.combineWithDocuments !== undefined) {
    update.combineWithDocuments = !!body.combineWithDocuments;
  }

  return update;
}

// ---------------------------------------------------------------------------
// Outro builder — footer appended to document-request emails
// ---------------------------------------------------------------------------

function buildOutro(selectedKeys, link, hasCustomNote, state) {
  const hasLinkTemplates = !!link && selectedKeys.some(k => state.linkTemplateKeys.has(k));
  const nonLinkKeys = selectedKeys.filter(k => !state.linkTemplateKeys.has(k));
  const hasNonLink = nonLinkKeys.length > 0 || hasCustomNote;

  if (hasLinkTemplates && hasNonLink) {
    return `Please upload the relevant documents through the link above and reply directly to this email with the remaining documents and information at your earliest convenience. Once we receive everything, our legal team will continue processing your compensation claim.`;
  }

  if (hasLinkTemplates && !hasNonLink) {
    return `Please upload all required documents through the link above at your earliest convenience. Once we receive them, our legal team will continue processing your compensation claim.`;
  }

  return `Please reply directly to this email with the requested documents and information at your earliest convenience. Once we receive them, our legal team will continue processing your compensation claim.`;
}

const { geminiQueue, isQuotaError } = require('../utils/geminiQueue');
// ---------------------------------------------------------------------------
// Shared AI translation helper
// ---------------------------------------------------------------------------

async function translateText(text, language, model) {
  const prompt = `You are a professional multilingual translator and flight compensation specialist.\n\nTranslate the following email content into ${language}.\n\nIMPORTANT: Output ONLY the translated content. No subject line, no explanatory text, no metadata.\n\n---\n${text}\n---`;
  const result = await geminiQueue.run(() => model.generateContent(prompt));
  return { text: result.response.text().trim(), result };
}

// ---------------------------------------------------------------------------
// Reference context helper — fetches saved references for AI prompts
// ---------------------------------------------------------------------------

async function getReferenceContext() {
  const refs = await EmailReference.find().sort({ createdAt: -1 }).limit(MAX_REFERENCES).lean();
  if (!refs.length) return '';

  let totalWords = 0;
  const included = [];
  for (const ref of refs) {
    const words = ref.content.split(/\s+/).length;
    if (totalWords + words > MAX_REFERENCE_WORDS) break;
    totalWords += words;
    included.push(`--- ${ref.title} ---\n${ref.content}`);
  }

  if (!included.length) return '';
  return `\n\nHere are reference communications for tone and style context:\n${included.join('\n\n')}\n\n`;
}

const EocRecord            = require('../models/EocRecord');
const { syncEocFromSheet } = require('../utils/syncEoc');

// --- Shared data helpers (jurisdiction + airline docs) ---
const {
  jurisdictionData,
  getJurisdictionLimit,
  getAirlineReqs,
} = require('../utils/dataLoader');

// Build the flat { "country": value } map the frontend JS (tools.js) expects.
// This is computed once at startup from jurisdiction_data.json so the frontend
// never needs its own hardcoded copy.
const jurisdictionLimitsForClient = Object.fromEntries(
  jurisdictionData.map(entry => [
    entry.country,
    entry.note ? entry.note : entry.years, // preserve display strings like "2 Months - 10"
  ])
);

const airlineCodesDatabase = require('../airlines_codes.json');

const normalizeStr = s =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ---------------------------------------------------------------------------
// EOC CHECKER
// ---------------------------------------------------------------------------

exports.checkEOC = async (req, res, next) => {
  try {
    const result = await eocService.findEOCEvents(req.query);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

// AIRPORT SEARCH
// ---------------------------------------------------------------------------

exports.searchAirports = (req, res, next) => {
  try {
    const q = (req.query.q || '').trim().toLowerCase();
    if (!q || q.length < 2) return res.json([]);

    const exactMatches      = [];
    const startsWithMatches = [];
    const includesMatches   = [];

    airportsDatabase.forEach(a => {
      const iata = (a.iata || '').toLowerCase();
      const city = (a.city || '').toLowerCase();
      const name = (a.name || '').toLowerCase();

      if (iata === q)                                     exactMatches.push(a);
      else if (iata.startsWith(q) || city.startsWith(q)) startsWithMatches.push(a);
      else if (iata.includes(q) || city.includes(q) || name.includes(q)) includesMatches.push(a);
    });

    res.json([...exactMatches, ...startsWithMatches, ...includesMatches].slice(0, 8));
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// FLIGHT STATUS (Cirium) — identical logic to ticketController
// ---------------------------------------------------------------------------

exports.checkFlightStatus = async (req, res, next) => {
  const result = await flightStatusService.getFlightStatus(req.query);
  res.json(result);
};

// DOCUMENT CHECKER
// ---------------------------------------------------------------------------

exports.checkDocs = catchAsync(async (req, res, next) => {
  const query = normalizeStr(req.query.airline || '');
  if (!query) return res.status(400).json({ error: 'Airline name is required' });

  const dbMatch = airlineCodesDatabase.find(a =>
    normalizeStr(a.name) === query ||
    (a.iata && a.iata.toLowerCase() !== 'na' && a.iata.toLowerCase() === query)
  );
  const displayAirline = dbMatch ? dbMatch.name : query;

  // getAirlineReqs returns "No documents required" when there's no specific entry
  const reqs    = getAirlineReqs(dbMatch ? dbMatch.name : query);
  const hasDocs = reqs !== 'No documents required';

  res.status(200).json({
    airline: displayAirline,
    hasDocs,
    reqs,
    iata:    dbMatch?.iata    || 'N/A',
    icao:    dbMatch?.icao    || 'N/A',
    country: dbMatch?.country || 'N/A',
  });
});

// ---------------------------------------------------------------------------
// AIRLINE SEARCH
// ---------------------------------------------------------------------------

exports.searchAirlines = catchAsync(async (req, res, next) => {
  const query = normalizeStr(req.query.q || '');
  if (!query || query.length < 2) return res.json([]);

  const results = [];
  for (const airline of airlineCodesDatabase) {
    const iataMatch = airline.iata && airline.iata.toLowerCase() !== 'na' && airline.iata.toLowerCase().includes(query);
    if (normalizeStr(airline.name).includes(query) || iataMatch) {
      results.push({ name: airline.name, iata: airline.iata });
    }
    if (results.length >= 10) break;
  }
  res.status(200).json(results);
});

// ---------------------------------------------------------------------------
// IATA LOOKUP
// ---------------------------------------------------------------------------

exports.lookupIATA = (req, res, next) => {
  try {
    const q = normalizeStr(req.query.q || '');
    if (!q || q.length < 2) return res.json([]);

    const activeExact = [], activeStartsWith = [], activeIncludes = [];
    const inactiveExact = [], inactiveStartsWith = [], inactiveIncludes = [];

    airlineCodesDatabase.forEach(a => {
      const iata = (a.iata || '').toLowerCase();
      const icao = (a.icao || '').toLowerCase();
      const name = normalizeStr(a.name);
      const isActive = a.active === 'Y';
      const bucket = isActive
        ? { exact: activeExact, sw: activeStartsWith, inc: activeIncludes }
        : { exact: inactiveExact, sw: inactiveStartsWith, inc: inactiveIncludes };

      if (iata === q || icao === q || name === q)                       bucket.exact.push(a);
      else if (iata.startsWith(q) || icao.startsWith(q) || name.startsWith(q)) bucket.sw.push(a);
      else if (iata.includes(q) || icao.includes(q) || name.includes(q))     bucket.inc.push(a);
    });

    const results = [
      ...activeExact, ...activeStartsWith, ...activeIncludes,
      ...inactiveExact, ...inactiveStartsWith, ...inactiveIncludes,
    ].slice(0, 8);

    res.json(results);
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// SMART EMAIL BUILDER
// ---------------------------------------------------------------------------

function logAiUsage(req, results, language, opType) {
  const totals = results.reduce((acc, r) => {
    const meta = r?.response?.usageMetadata || {};
    acc.iTok += meta.promptTokenCount || 0;
    acc.oTok += meta.candidatesTokenCount || 0;
    acc.tTok += meta.thoughtsTokenCount || 0;
    return acc;
  }, { iTok: 0, oTok: 0, tTok: 0 });
  const { iTok, oTok, tTok } = totals;
  const costUSD = calculateCost('gemini-2.5-flash', {
    promptTokenCount: iTok,
    candidatesTokenCount: oTok,
    thoughtsTokenCount: tTok,
  }).costUSD;
  logUsage(req, {
    operationType: opType || 'email_translation',
    model: 'gemini-2.5-flash',
    inputTokens: iTok,
    outputTokens: oTok + tTok,
    costUSD,
    metadata: { language }
  });
}

exports.generateEmail = catchAsync(async (req, res, next) => {
  const templateState = await getEmailTemplateState();
  const { byKey } = templateState;
  const { mode, language, selectedTemplates = [], link, customNote, useWrapper, placeholderValues } = req.body;

  if (!mode) return next(new AppError('Please provide the email mode', 400));
  if (mode !== 'request') return next(new AppError('Invalid mode', 400));
  if (!selectedTemplates.length && !customNote?.trim()) {
    return next(new AppError('Please select at least one template or add a custom note', 400));
  }

  const isEnglish = language === 'English';
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  let generationResult = null;
  let translationResult = null;

  const sortedSelected = [...selectedTemplates].sort((a, b) => {
    if (a === 'Signed Power of Attorney') return -1;
    if (b === 'Signed Power of Attorney') return 1;
    return 0;
  });

  const normalizePlaceholderName = name => String(name || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  const formatPlaceholderValue = (key, value) => {
    const val = String(value || '').trim();
    if (!val) return '';
    if (normalizePlaceholderName(key) === 'amount' && !/\u20ac/.test(val)) {
      const amount = val
        .replace(/^(eur|euro)\s*/i, '')
        .replace(/\s*(eur|euro)$/i, '')
        .trim();
      return `\u20ac${amount}`;
    }
    return val;
  };

  const applyPlaceholders = text => {
    if (!placeholderValues || typeof placeholderValues !== 'object') return text;
    return text.replace(/\{([^}]+)\}/g, (_, key) => {
      const val = formatPlaceholderValue(key, placeholderValues[key.trim()]);
      return val || `{${key}}`;
    });
  };

  const makeBullet = key => {
    const t = byKey[key];
    if (!t) return '';
    let text = link ? t.text.replace(/\[link\]/g, link) : t.text;
    text = applyPlaceholders(text);
    return `• ${text}`;
  };

  // Categorize selected templates by type
  const rejectionKeys = sortedSelected.filter(k => byKey[k]?.type === 'rejection');
  const docRequestKeys = sortedSelected.filter(k => byKey[k]?.type === 'document-request');
  const specialStandaloneKeys = sortedSelected.filter(k =>
    byKey[k]?.type === 'special-case' && !byKey[k]?.combineWithDocuments
  );
  const specialCombinableKeys = sortedSelected.filter(k =>
    byKey[k]?.type === 'special-case' && byKey[k]?.combineWithDocuments
  );

  // Process custom note via AI
  let customNoteBullet = null;
  if (customNote?.trim()) {
    const referenceContext = await getReferenceContext();
    const noteRewritePrompt = `You are a claims specialist at ReFly, a flight compensation company writing to a passenger.${referenceContext}\n\nRewrite the following note as a warm, professional sentence for a flight compensation claim email. Tone: human and considerate — the passenger may be in a stressful situation. Phrase it as a polite request or question, not a command. No filler phrases. No bullet point, no greeting, no sign-off. Output only the rewritten sentence.\n\n"${customNote.trim()}"`;
    try {
      generationResult = await geminiQueue.run(() => model.generateContent(noteRewritePrompt));
    } catch (err) {
      if (isQuotaError(err)) return next(new AppError('AI service is temporarily at capacity. Please try again in a moment.', 503));
      return next(new AppError(`Email generation failed: ${err.message}`, 502));
    }
    customNoteBullet = `• ${generationResult.response.text().trim()}`;
  }

  // Build email sections
  const sections = [];

  const rejectionText = rejectionKeys
    .filter(k => byKey[k])
    .map(k => byKey[k].text)
    .join('\n\n');
  if (rejectionText) sections.push(rejectionText);

  const standaloneBullets = specialStandaloneKeys.filter(k => byKey[k]).map(makeBullet);
  if (standaloneBullets.length) sections.push(standaloneBullets.join('\n\n'));

  const wrappedBullets = [
    ...docRequestKeys.filter(k => byKey[k]).map(makeBullet),
    ...specialCombinableKeys.filter(k => byKey[k]).map(makeBullet),
    ...(customNoteBullet ? [customNoteBullet] : [])
  ];

  if (wrappedBullets.length) {
    const hasDocRequests = docRequestKeys.length > 0;
    const addOutro = hasDocRequests || (customNoteBullet && useWrapper);
    const outroKeys = [...docRequestKeys, ...specialCombinableKeys];
    const outro = buildOutro(outroKeys, link, !!customNoteBullet, templateState);
    const docSection = addOutro
      ? `${wrappedBullets.join('\n\n')}\n\n${outro}`
      : wrappedBullets.join('\n\n');
    sections.push(docSection);
  }

  const englishBody = sections.join('\n\n');

  // Translate if needed
  let email, englishTranslation = null;
  if (!isEnglish) {
    try {
      const tr = await translateText(englishBody, language, model);
      translationResult = tr.result;
      email = tr.text;
      englishTranslation = englishBody;
    } catch (err) {
      if (isQuotaError(err)) return next(new AppError('AI service is temporarily at capacity. Please try again in a moment.', 503));
      return next(new AppError(`Translation failed: ${err.message}`, 502));
    }
  } else {
    email = englishBody;
  }

  logAiUsage(req, [generationResult, translationResult], language);
  res.status(200).json({ success: true, email, englishTranslation });
});

// ---------------------------------------------------------------------------
// TRANSLATE EMAIL — standalone translation endpoint for live sync
// ---------------------------------------------------------------------------

exports.translateEmail = catchAsync(async (req, res, next) => {
  const { text, language } = req.body;
  if (!text?.trim()) return next(new AppError('text is required', 400));
  if (!language || language === 'English') return next(new AppError('Non-English language is required', 400));

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  try {
    const tr = await translateText(text, language, model);
    logAiUsage(req, [tr.result], language, 'email_translation_sync');
    res.json({ success: true, translated: tr.text });
  } catch (err) {
    if (isQuotaError(err)) return next(new AppError('AI service is temporarily at capacity. Please try again in a moment.', 503));
    return next(new AppError(`Translation failed: ${err.message}`, 502));
  }
});

// ---------------------------------------------------------------------------
// REFINE EMAIL SECTION — AI refinement with magic wand
// ---------------------------------------------------------------------------

exports.refineEmailSection = catchAsync(async (req, res, next) => {
  const { section, context, language } = req.body;
  if (!section?.trim()) return next(new AppError('section is required', 400));

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const referenceContext = await getReferenceContext();

  const prompt = `You are a claims specialist at ReFly, a flight compensation company writing to a passenger.${referenceContext}\n\nGiven the following full email for context:\n---\n${context || ''}\n---\n\nRefine ONLY the following paragraph to be warm, professional, and contextually appropriate for a flight compensation claim email. Maintain consistency with the surrounding email tone. Output only the refined paragraph, nothing else.\n\n"${section.trim()}"`;

  let refineResult, translateResult = null;
  try {
    refineResult = await geminiQueue.run(() => model.generateContent(prompt));
  } catch (err) {
    if (isQuotaError(err)) return next(new AppError('AI service is temporarily at capacity. Please try again in a moment.', 503));
    return next(new AppError(`Refinement failed: ${err.message}`, 502));
  }

  const refined = refineResult.response.text().trim();
  let translatedRefined = null;

  if (language && language !== 'English') {
    try {
      const tr = await translateText(refined, language, model);
      translateResult = tr.result;
      translatedRefined = tr.text;
    } catch (_) {
      // Non-critical: return refined even if translation fails
    }
  }

  logAiUsage(req, [refineResult, translateResult], language, 'email_refinement');
  res.json({ success: true, refined, translatedRefined });
});

// ---------------------------------------------------------------------------
// EMAIL TEMPLATE CRUD
// ---------------------------------------------------------------------------

exports.getEmailTemplates = catchAsync(async (req, res) => {
  res.json({ success: true, templates: await getEmailTemplateList() });
});

exports.createEmailTemplate = catchAsync(async (req, res, next) => {
  const template = buildTemplateDocument(req.body);
  if (!template.key || !template.text || !template.type) {
    return next(new AppError('key, text, and type are required', 400));
  }

  const existing = await EmailTemplate.findOne({ key: template.key });
  if (existing) return next(new AppError('A template with that key already exists', 409));

  await EmailTemplate.create(template);
  res.json({ success: true, templates: await getEmailTemplateList() });
});

exports.updateEmailTemplate = catchAsync(async (req, res, next) => {
  const key = String(req.body.key || '').trim();
  if (!key) return next(new AppError('key is required', 400));

  const existing = await EmailTemplate.findOne({ key });
  if (!existing) return next(new AppError('Template not found', 404));

  const update = buildTemplateUpdate(req.body);
  if (update.text !== undefined && !update.text) {
    return next(new AppError('text is required', 400));
  }
  if (update.label !== undefined && !update.label) {
    return next(new AppError('label is required', 400));
  }

  if (Object.keys(update).length) {
    await EmailTemplate.updateOne({ key }, { $set: update }, { runValidators: true });
  }

  res.json({ success: true, templates: await getEmailTemplateList() });
});

exports.deleteEmailTemplate = catchAsync(async (req, res, next) => {
  const key = String(req.params.key || '').trim();
  if (!key) return next(new AppError('key is required', 400));

  const result = await EmailTemplate.deleteOne({ key });
  if (!result.deletedCount) return next(new AppError('Template not found', 404));

  res.json({ success: true, templates: await getEmailTemplateList() });
});

// ---------------------------------------------------------------------------
// EMAIL REFERENCE CRUD — persistent AI context
// ---------------------------------------------------------------------------

exports.getEmailReferences = catchAsync(async (req, res) => {
  const refs = await EmailReference.find().sort({ createdAt: -1 }).lean();
  res.json({ success: true, references: refs });
});

exports.createEmailReference = catchAsync(async (req, res, next) => {
  const title = String(req.body.title || '').trim();
  const content = String(req.body.content || '').trim();
  if (!title || !content) return next(new AppError('title and content are required', 400));

  const count = await EmailReference.countDocuments();
  if (count >= MAX_REFERENCES) {
    return next(new AppError(`Maximum ${MAX_REFERENCES} references allowed. Delete one first.`, 400));
  }

  await EmailReference.create({ title, content });
  const refs = await EmailReference.find().sort({ createdAt: -1 }).lean();
  res.json({ success: true, references: refs });
});

exports.deleteEmailReference = catchAsync(async (req, res, next) => {
  const id = req.params.id;
  if (!id) return next(new AppError('id is required', 400));

  const result = await EmailReference.deleteOne({ _id: id });
  if (!result.deletedCount) return next(new AppError('Reference not found', 404));

  const refs = await EmailReference.find().sort({ createdAt: -1 }).lean();
  res.json({ success: true, references: refs });
});

// ---------------------------------------------------------------------------
// EOC SYNC
// ---------------------------------------------------------------------------

exports.syncEOC = async (req, res) => {
  try {
    const previousCount = await EocRecord.countDocuments();
    console.log(`[syncEOC] Sync requested. Current count: ${previousCount}`);
    const { newCount, delta } = await syncEocFromSheet(previousCount);
    const deltaStr = delta > 0 ? `+${delta}` : String(delta);
    console.log(`[syncEOC] Done. New count: ${newCount} (${deltaStr})`);
    res.json({ success: true, newCount, delta, message: `Synced ${newCount} records, ${deltaStr} new` });
  } catch (error) {
    console.error('[syncEOC] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

