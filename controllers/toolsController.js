'use strict';

const airportsDatabase = require('../airports_data.json');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const catchAsync = require('../utils/catchAsync');
const AppError   = require('../utils/appError');
const logUsage   = require('../utils/logUsage');
const emailTemplates = require('../data/emailTemplates.json');
const DOCUMENT_TEMPLATES = emailTemplates.documentTemplates;
const REJECTION_TEMPLATES = emailTemplates.rejectionTemplates;

const TEMPLATE_KEYWORDS = [
  { template: 'Boarding pass', aliases: ['boarding pass'] },
  { template: 'Ticket number (13-digit)', aliases: ['ticket number', 'ticket num', 'ticket no', 'e-ticket number', '13-digit ticket'] },
  { template: 'PNR / Booking Reference', aliases: ['pnr', 'booking reference', 'booking ref', 'record locator'] },
  { template: 'ID / Passport', aliases: ['id', 'passport', 'identity document', 'national id'] },
  { template: 'Signed Power of Attorney', aliases: ['power of attorney', 'signed poa', 'poa'] },
  { template: 'Booking confirmation', aliases: ['booking confirmation', 'reservation confirmation', 'ticket confirmation'] },
  { template: 'Proof of delay', aliases: ['proof of delay', 'delay proof', 'flight delay'] },
  { template: 'Proof of cancellation', aliases: ['proof of cancellation', 'cancellation proof', 'flight cancellation'] },
  { template: 'passengers documents not complete', aliases: ['passengers documents', 'passenger documents', 'passenger information', 'missing passengers', 'passengers information', 'passenger upload', 'passenger docs'] },
  { template: 'Visa/Documentation Rejection', aliases: ['visa issue', 'documentation issue', 'visa rejection', 'documentation rejection', 'visa/documentation'] },
  { template: 'Short Delay / No Missed Connection Rejection', aliases: ['short delay', 'no missed connection', 'missed connection'] },
  { template: 'No Disruption Found Rejection', aliases: ['no disruption found', 'no disruption', 'disruption not found'] },
  { template: 'Jurisdiction expired Rejection', aliases: ['jurisdiction expired', 'limitation period', 'time-barred', 'statute of limitations'] },
  { template: 'Disrupted & Affected Flights Not Under Same Booking Rejection', aliases: ['not under same booking', 'separate booking', 'different reservation', 'same booking'] },
];

function extractUrls(text) {
  const urls = [];
  const regex = /https?:\/\/[\w\-./?=&%#]+/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    urls.push(match[0]);
  }
  return urls;
}

function findTemplateMatches(requestText) {
  const normalized = requestText.toLowerCase();
  const matches = new Set();
  TEMPLATE_KEYWORDS.forEach(({ template, aliases }) => {
    if (aliases.some(alias => normalized.includes(alias))) {
      matches.add(template);
    }
  });
  return Array.from(matches);
}

function isUseTemplateRequest(requestText) {
  return /\buse templates?\b/i.test(requestText);
}

function wrapWithTemplate(content) {
  return `In order to proceed with your claim and process your compensation, we require the following information and documents:

${content}

Please reply directly to this email with the requested information and documents at your earliest convenience. Once we receive them, our legal team will continue processing your compensation claim.`;
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

let airlineDatabase = [];
try {
  airlineDatabase = require('../airlines_data.json');
} catch (err) {
  console.warn("⚠️ airlines_data.json not found. Please run 'node build_airlines.js' first.");
}

const airlineCodesDatabase = require('../airlines_codes.json');

const { geminiQueue, isQuotaError } = require('../utils/geminiQueue');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ---------------------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------------------

exports.renderTools = catchAsync(async (req, res, next) => {
  res.render('tools', {
    title: 'Tools Suite',
    jurisdictionLimits: jurisdictionLimitsForClient,
  });
});

// ---------------------------------------------------------------------------
// EOC CHECKER
// ---------------------------------------------------------------------------

exports.checkEOC = async (req, res, next) => {
  try {
    const { date, originIata, destIata, originCountry, destCountry } = req.query;
    if (!date || date === 'Unknown') return res.json({ eocFound: false });

    const oIata    = (originIata    || '').toLowerCase();
    const dIata    = (destIata      || '').toLowerCase();
    const oCountry = (originCountry || '').toLowerCase();
    const dCountry = (destCountry   || '').toLowerCase();

    // Collect non-empty location values to match against
    const locs = [oIata, dIata, oCountry, dCountry, 'world wide']
      .filter(v => v && v.trim());

    // Case-insensitive exact-match regex for any of those values
    const escaped = locs.map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const locRegex = new RegExp('^(' + escaped.join('|') + ')$', 'i');

    // Run both queries in parallel
    const [exactMatches, ongoingMatches] = await Promise.all([
      EocRecord.find({
        category: { $not: /ongoing/i },
        location: locRegex,
        date: date                        // exact date match
      }).lean(),
      EocRecord.find({
        category: /ongoing/i,
        location: locRegex,
        date: { $lte: date }              // event date <= flight date  (YYYY-MM-DD string compare works)
      }).lean()
    ]);

    const matchedEvents = [...exactMatches, ...ongoingMatches];
    res.json({ eocFound: matchedEvents.length > 0, events: matchedEvents });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
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
  try {
    const { flightNumber, date, origin, destination } = req.query;
    if (!flightNumber || flightNumber === 'N/A')
      return res.json({ error: 'Valid flight number is required' });

    const ciriumAppId  = process.env.CIRIUM_APP_ID;
    const ciriumAppKey = process.env.CIRIUM_APP_KEY;
    if (!ciriumAppId || !ciriumAppKey) {
      console.error('[Cirium] Error: CIRIUM_APP_ID or CIRIUM_APP_KEY Missing in config.env!');
      return res.json({ error: 'Cirium API Credentials Missing. Check .env file.' });
    }

    const match = flightNumber.match(/([A-Za-z]{3}|[A-Za-z0-9]{2})\s*0*(\d{1,4})/);
    if (!match)
      return res.json({ error: `Invalid flight format (${flightNumber}). Expected format like 'LH458', 'VS207', or 'U28412'.` });

    const carrier = match[1].toUpperCase();
    const fNum    = match[2];

    let year, month, day;
    if (date && date !== 'Unknown') {
      [year, month, day] = date.split('-');
    } else {
      const today = new Date();
      year  = today.getFullYear();
      month = String(today.getMonth() + 1).padStart(2, '0');
      day   = String(today.getDate()).padStart(2, '0');
    }

    const url = `https://api.flightstats.com/flex/flightstatus/rest/v2/json/flight/status/${carrier}/${fNum}/dep/${year}/${month}/${day}?appId=${ciriumAppId}&appKey=${ciriumAppKey}&utc=false`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const data = await response.json();

    if (data.error) return res.json({ error: data.error.errorMessage || 'Cirium API Error' });
    if (!data.flightStatuses || data.flightStatuses.length === 0)
      return res.json({ error: `No flight data found in Cirium for ${carrier}${fNum} on ${date}.` });

    let targetFlight = data.flightStatuses[0];
    const requestedDateStr = `${year}-${month}-${day}`;

    let exactMatches = data.flightStatuses.filter(f => {
      const originMatches = !origin      || origin      === 'Unknown' || f.departureAirportFsCode === origin.toUpperCase();
      const destMatches   = !destination || destination === 'Unknown' || f.arrivalAirportFsCode   === destination.toUpperCase();
      const dateMatches   = f.departureDate?.dateLocal?.startsWith(requestedDateStr);
      return originMatches && destMatches && dateMatches;
    });

    if (!exactMatches.length) {
      exactMatches = data.flightStatuses.filter(f => {
        const destMatches = !destination || destination === 'Unknown' || f.arrivalAirportFsCode === destination.toUpperCase();
        return destMatches && f.departureDate?.dateLocal?.startsWith(requestedDateStr);
      });
    }
    if (!exactMatches.length) {
      exactMatches = data.flightStatuses.filter(f => f.departureDate?.dateLocal?.startsWith(requestedDateStr));
    }

    let hasMultipleDisruptions = false;
    if (exactMatches.length > 0) {
      const statusPriority = { D: 1, C: 2, L: 3, A: 4, S: 5, U: 6 };
      exactMatches.sort((a, b) => (statusPriority[a.status] || 99) - (statusPriority[b.status] || 99));
      targetFlight = exactMatches[0];
      const uniqueStatuses = [...new Set(exactMatches.map(f => f.status))];
      if (uniqueStatuses.includes('D') && uniqueStatuses.includes('C')) hasMultipleDisruptions = true;
    }

    const formatDate = ds => {
      if (!ds) return '--';
      const d = new Date(ds);
      const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${String(d.getDate()).padStart(2,'0')}-${m[d.getMonth()]}-${d.getFullYear()}`;
    };
    const formatTime = ds => {
      if (!ds) return '--:--';
      const d = new Date(ds);
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    };
    const calcOffset = (local, utc) => {
      if (!local || !utc) return 'Local';
      const diff = Math.round((new Date(local) - new Date(utc)) / 3600000);
      return diff >= 0 ? `UTC+${diff}` : `UTC${diff}`;
    };
    const formatDuration = mins => {
      if (!mins || isNaN(mins)) return '--h --m';
      return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    };

    const ops  = targetFlight.operationalTimes || {};
    const sDep = ops.scheduledGateDeparture  || ops.scheduledRunwayDeparture || ops.publishedDeparture || {};
    const aDep = ops.actualGateDeparture     || ops.estimatedGateDeparture   || ops.actualRunwayDeparture || sDep;
    const sArr = ops.scheduledGateArrival    || ops.scheduledRunwayArrival   || ops.publishedArrival    || {};
    const aArr = ops.actualGateArrival       || ops.estimatedGateArrival     || ops.actualRunwayArrival  || sArr;

    const depActualLabel = (ops.actualGateDeparture || ops.actualRunwayDeparture) ? 'Actual' : (ops.estimatedGateDeparture ? 'Estimated' : 'Scheduled');
    const arrActualLabel = (ops.actualGateArrival   || ops.actualRunwayArrival)   ? 'Actual' : (ops.estimatedGateArrival  ? 'Estimated' : 'Scheduled');

    const flightDuration = formatDuration(targetFlight.flightDurations?.scheduledBlockMinutes || 0);
    const arrDelayMins   = targetFlight.delays?.arrivalGateDelayMinutes || targetFlight.delays?.arrivalRunwayDelayMinutes || 0;
    let arrDelayStr = 'On Time';
    if (arrDelayMins > 0) arrDelayStr = arrDelayMins >= 60 ? formatDuration(arrDelayMins) : `${arrDelayMins} mins`;

    const rawStatus          = targetFlight.status || 'U';
    const arrTimeDataPending = rawStatus === 'L' && !ops.actualGateArrival && !ops.actualRunwayArrival && !ops.estimatedGateArrival;
    const bannerTextCol      = '#ffffff';
    const divertedCode       = rawStatus === 'D' ? (targetFlight.divertedAirportFsCode || '???') : null;
    let bannerBg, bannerText, arrDelayColor;

    switch (rawStatus) {
      case 'S':
        if (arrDelayMins > 0) { bannerBg = '#f59e0b'; bannerText = `SCHEDULED | Delayed ${arrDelayStr}`; arrDelayColor = '#ef4444'; }
        else                  { bannerBg = '#3b82f6'; bannerText = 'SCHEDULED'; arrDelayStr = 'Scheduled'; arrDelayColor = '#3b82f6'; }
        break;
      case 'A':
        if (arrDelayMins > 0) { bannerBg = '#f59e0b'; bannerText = `IN FLIGHT | Delayed ${arrDelayStr}`; arrDelayColor = '#ef4444'; }
        else                  { bannerBg = '#3b82f6'; bannerText = 'IN FLIGHT'; arrDelayColor = '#22c55e'; }
        break;
      case 'L':
        if (arrTimeDataPending)   { bannerBg = '#f59e0b'; bannerText = 'LANDED | FINAL ARRIVAL PENDING'; arrDelayStr = 'Pending / Unknown'; arrDelayColor = '#f59e0b'; }
        else if (arrDelayMins > 0){ bannerBg = '#f59e0b'; bannerText = `LANDED | ${arrDelayStr} Late`; arrDelayColor = '#ef4444'; }
        else                      { bannerBg = '#22c55e'; bannerText = 'LANDED | On Time'; arrDelayColor = '#22c55e'; }
        break;
      case 'C':
        bannerBg = '#ef4444'; bannerText = 'FLIGHT CANCELLED'; arrDelayStr = 'CANCELLED'; arrDelayColor = '#ef4444';
        break;
      case 'D':
        if (hasMultipleDisruptions) {
          bannerBg = '#991b1b'; bannerText = `DIVERTED & CANCELLED → ${divertedCode}`; arrDelayStr = 'DIVERTED/CANCELLED'; arrDelayColor = '#ef4444';
        } else {
          bannerBg = '#ef4444';
          bannerText = arrDelayMins > 0 ? `DIVERTED → ${divertedCode} | Delayed ${arrDelayStr}` : `DIVERTED → ${divertedCode}`;
          arrDelayStr = 'DIVERTED'; arrDelayColor = '#ef4444';
        }
        break;
      default:
        bannerBg = '#64748b'; bannerText = 'STATUS UNKNOWN'; arrDelayStr = 'Unknown'; arrDelayColor = '#64748b';
    }

    let depIata = targetFlight.departureAirportFsCode || 'N/A';
    let arrIata = targetFlight.arrivalAirportFsCode   || 'N/A';
    let depCity = depIata, arrCity = arrIata, depName = '', arrName = '';
    let divertedToCity = null;
    let operatorCode = targetFlight.operatingCarrierFsCode || targetFlight.carrierFsCode || carrier;
    let operatorName = operatorCode;

    if (data.appendix?.airports) {
      const dPort = data.appendix.airports.find(a => a.fs === depIata);
      if (dPort) { depCity = dPort.city || depIata; depName = dPort.name || ''; }
      const aPort = data.appendix.airports.find(a => a.fs === arrIata);
      if (aPort) { arrCity = aPort.city || arrIata; arrName = aPort.name || ''; }
      if (divertedCode) {
        const dvPort = data.appendix.airports.find(a => a.fs === divertedCode);
        if (dvPort) divertedToCity = dvPort.city || divertedCode;
      }
    }
    if (data.appendix?.airlines) {
      const opLine = data.appendix.airlines.find(a => a.fs === operatorCode || a.iata === operatorCode || a.icao === operatorCode);
      if (opLine) operatorName = opLine.name || operatorCode;
    }

    res.json({
      aiStats: {
        bannerBg, bannerTextCol, bannerText, flightDuration, operatorName,
        rawStatus, divertedTo: divertedCode, divertedToCity, arrTimeDataPending,
        depIata, depCity, depName,
        depDate: formatDate(sDep.dateLocal),
        depSched: formatTime(sDep.dateLocal), depSchedZone: calcOffset(sDep.dateLocal, sDep.dateUtc),
        depActual: formatTime(aDep.dateLocal), depActualZone: calcOffset(aDep.dateLocal, aDep.dateUtc), depActualLabel,
        arrIata, arrCity, arrName,
        arrDate: formatDate(sArr.dateLocal),
        arrSched: formatTime(sArr.dateLocal), arrSchedZone: calcOffset(sArr.dateLocal, sArr.dateUtc),
        arrActual: formatTime(aArr.dateLocal), arrActualZone: calcOffset(aArr.dateLocal, aArr.dateUtc),
        arrActualLabel: arrTimeDataPending ? 'Data Pending' : arrActualLabel,
        arrDelay: arrDelayStr, arrDelayColor,
      },
      rawResponse: data,
    });
  } catch (error) {
    console.error('🔥 Flight Status Crash:', error);
    return res.json({ error: error.message || 'An unexpected server error occurred.' });
  }
};

// ---------------------------------------------------------------------------
// DOCUMENT CHECKER
// ---------------------------------------------------------------------------

exports.checkDocs = catchAsync(async (req, res, next) => {
  const query = (req.query.airline || '').toLowerCase().trim();
  if (!query) return res.status(400).json({ error: 'Airline name is required' });

  const dbMatch      = airlineDatabase.find(a => a.name.toLowerCase() === query || a.iata.toLowerCase() === query);
  const displayAirline = dbMatch ? dbMatch.name : query;

  // getAirlineReqs returns "No documents required" when there's no specific entry
  const reqs    = getAirlineReqs(dbMatch ? dbMatch.name : query);
  const hasDocs = reqs !== 'No documents required';

  res.status(200).json({ airline: displayAirline, hasDocs, reqs });
});

// ---------------------------------------------------------------------------
// AIRLINE SEARCH
// ---------------------------------------------------------------------------

exports.searchAirlines = catchAsync(async (req, res, next) => {
  const query = (req.query.q || '').toLowerCase().trim();
  if (!query || query.length < 2) return res.json([]);

  const results = [];
  for (const airline of airlineDatabase) {
    if (airline.name.toLowerCase().includes(query) || airline.iata.toLowerCase().includes(query)) {
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
    const q = (req.query.q || '').trim().toLowerCase();
    if (!q || q.length < 2) return res.json([]);

    const activeExact = [], activeStartsWith = [], activeIncludes = [];
    const inactiveExact = [], inactiveStartsWith = [], inactiveIncludes = [];

    airlineCodesDatabase.forEach(a => {
      const iata = (a.iata || '').toLowerCase();
      const icao = (a.icao || '').toLowerCase();
      const name = (a.name || '').toLowerCase();
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
// HELPER FUNCTIONS FOR EMAIL GENERATION
// ---------------------------------------------------------------------------

function assembleDocRequestTemplate(bulletPointsContent) {
  return `In order to proceed with your claim and process your compensation, we require the following information and documents:\n\n${bulletPointsContent}\n\nPlease reply directly to this email with the requested information and documents at your earliest convenience. Once we receive them, our legal team will continue processing your compensation claim.`;
}

function buildEnglishBody(isRejection, checkboxContent, customRequest, passengersContent = '') {
  let body = '';
  if (passengersContent) {
    body = passengersContent;
    if (checkboxContent) {
      body += '\n\n' + assembleDocRequestTemplate(checkboxContent);
    }
  } else if (checkboxContent) {
    if (isRejection) {
      body = checkboxContent;
    } else {
      body = assembleDocRequestTemplate(checkboxContent);
    }
  }
  if (customRequest) {
    body += (body ? '\n\n' : '') + `[CUSTOM REQUEST — REFINE THIS PART]: ${customRequest}`;
  }
  return body;
}

function buildTranslationPrompt(language, englishBody, customRequest, isEnglish) {
  let prompt = `You are a professional multilingual translator and a flight compensation specialist.\n\n`;
  prompt += `Your tasks:\n`;
  prompt += `1. Translate the following email content into ${language}.\n`;
  if (customRequest) {
    prompt += `2. The section marked [CUSTOM REQUEST — REFINE THIS PART] must be professionally rewritten before translation. Make it clear, formal, and suitable for a compensation claim correspondence. Remove the marker tag after refining.\n`;
  }
  if (!isEnglish) {
    prompt += `3. After the translated version, append the exact separator "|||ENGLISH|||" on its own line, then provide the full English version of the final email.\n`;
  }
  prompt += `\nIMPORTANT: Output ONLY the email body. No subject line, no explanatory text, no metadata.\n\n`;
  prompt += `---\n${englishBody}\n---`;
  return prompt;
}

function buildFreestylePrompt(language, customRequest, isEnglish) {
  let prompt = `You are a professional multilingual email writer and a flight compensation specialist.\n\n`;
  prompt += `Rewrite and refine the following message to be professional, clear, and appropriate for a compensation claim correspondence. Do not add any template structure, greetings, or closings — output only the refined body content.\n`;
  if (!isEnglish) {
    prompt += `Then translate the refined content into ${language}.\n`;
    prompt += `After the translated version, append the exact separator "|||ENGLISH|||" on its own line, then provide the English version.\n`;
  }
  prompt += `\nCustom message to refine:\n"${customRequest}"`;
  return prompt;
}

// ---------------------------------------------------------------------------
// SMART EMAIL BUILDER
// ---------------------------------------------------------------------------

exports.generateEmail = catchAsync(async (req, res, next) => {
  const { language, requestText } = req.body;

  if (!requestText || !requestText.trim()) {
    return next(new AppError('Please provide the requested information', 400));
  }

  const isEnglish = language === 'English';
  const urls = extractUrls(requestText);
  const matchedTemplates = findTemplateMatches(requestText);
  const passengerLink = urls.length ? urls[0] : null;
  const useTemplateMode = isUseTemplateRequest(requestText);

  // --- Build AI prompt ---
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const templatesJson = JSON.stringify(emailTemplates, null, 2);
  let prompt = `You are a professional flight compensation specialist and email writer.

Available templates:
${templatesJson}

User request: "${requestText}"

Detected template matches: ${matchedTemplates.length ? matchedTemplates.join(', ') : 'none'}.
`;
  if (passengerLink) {
    prompt += `Use this passenger upload link when applying the passenger template: ${passengerLink}
`;
  }
  if (useTemplateMode) {
    prompt += 'The user requested "use template". Assemble the content and the server will wrap it in the required claim request template block.\n';
  }
  prompt += `
Your task:
- For each detected template, use the EXACT template text from the JSON.
- Match using keywords and synonyms; treat "use template" as an instruction to apply templates directly.
- If the request contains any remaining items that do not match a known template, draft a short professional request for those items in the same style.
- Output document requests as bullet points and rejection templates as plain text.
- Do not add greetings, closings, or extra commentary.
- Output ONLY the final email body.

Example: If user says "ticket number, boarding pass", output:
• Please provide your 13-digit ticket number.You can find this number on your booking confirmation email (usually labelled Ticket Number or e-Ticket Number), in the airline's app under My Trips, or by contacting the airline's customer service directly.
• Please provide a copy of your boarding pass for the disrupted flight(s). You can find your boarding pass in the confirmation email from the airline, in the airline's mobile app, or at the airport check-in counter. A photo or scan of the physical boarding pass is also acceptable.
`;

  // --- Call Gemini ---
  let result;
  try {
    result = await geminiQueue.run(() => model.generateContent(prompt));
  } catch (err) {
    if (isQuotaError(err)) return next(new AppError('AI service is temporarily at capacity. Please try again in a moment.', 503));
    return next(new AppError(`Email generation failed: ${err.message}`, 502));
  }
  const rawText = result.response.text();
  const trimmedRawText = rawText.trim();
  const wrappedEnglish = useTemplateMode ? wrapWithTemplate(trimmedRawText) : trimmedRawText;

  // --- Parse response ---
  let email, englishTranslation = null;
  if (!isEnglish) {
    // Translate
    const translationPrompt = `You are a professional multilingual translator and a flight compensation specialist.

Translate the following email content into ${language}.

IMPORTANT: Output ONLY the translated content. No subject line, no explanatory text, no metadata.

---
${wrappedEnglish}
---`;

    let translationResult;
    try {
      translationResult = await geminiQueue.run(() => model.generateContent(translationPrompt));
    } catch (err) {
      if (isQuotaError(err)) return next(new AppError('AI service is temporarily at capacity. Please try again in a moment.', 503));
      return next(new AppError(`Translation failed: ${err.message}`, 502));
    }
    const translatedText = translationResult.response.text().trim();
    email = translatedText;
    englishTranslation = wrappedEnglish;
  } else {
    email = wrappedEnglish;
  }

  const { promptTokenCount: iTok = 0, candidatesTokenCount: oTok = 0, thoughtsTokenCount: tTok = 0 } = result.response.usageMetadata || {};
  const { MODEL_PRICING } = require('../utils/pricing');
  const emailRates = MODEL_PRICING['gemini-2.5-flash'];
  const emailCostUSD = (iTok / 1_000_000) * emailRates.input + ((oTok + tTok) / 1_000_000) * emailRates.output;
  logUsage(req, {
    operationType: 'email_translation',
    model: 'gemini-2.5-flash',
    inputTokens: iTok,
    outputTokens: oTok + tTok,
    costUSD: emailCostUSD,
    metadata: { language }
  });

  res.status(200).json({ success: true, email, englishTranslation });
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