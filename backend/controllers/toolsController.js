'use strict';

const fs   = require('fs');
const path = require('path');

const airportsDatabase = require('../airports_data.json');
const EmailTemplate    = require('../models/EmailTemplate');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const catchAsync = require('../utils/catchAsync');
const AppError   = require('../utils/appError');
const logUsage   = require('../utils/logUsage');

let DOCUMENT_TEMPLATES  = {};
let REJECTION_TEMPLATES = {};
let TEMPLATES_META      = {};
let LINK_TEMPLATE_KEYS      = new Set();
let INFO_ONLY_TEMPLATE_KEYS = new Set();
let NO_WRAPPER_DOC_KEYS     = new Set();
let _templatesCached = false;

async function loadTemplates() {
  if (_templatesCached) return;
  const docs = await EmailTemplate.find().lean();
  DOCUMENT_TEMPLATES  = {};
  REJECTION_TEMPLATES = {};
  TEMPLATES_META      = {};
  docs.forEach(t => {
    if (t.type === 'document') DOCUMENT_TEMPLATES[t.key]  = t.text;
    else                       REJECTION_TEMPLATES[t.key] = t.text;
    TEMPLATES_META[t.key] = { label: t.label, category: t.category, isInfoOnly: t.isInfoOnly, noWrapper: t.noWrapper };
  });
  LINK_TEMPLATE_KEYS      = new Set(Object.keys(DOCUMENT_TEMPLATES).filter(k => (DOCUMENT_TEMPLATES[k] || '').includes('[link]')));
  INFO_ONLY_TEMPLATE_KEYS = new Set(Object.keys(TEMPLATES_META).filter(k => TEMPLATES_META[k].isInfoOnly));
  NO_WRAPPER_DOC_KEYS     = new Set(Object.keys(TEMPLATES_META).filter(k => TEMPLATES_META[k].noWrapper));
  _templatesCached = true;
}

function buildTemplateListSync() {
  return [
    ...Object.entries(DOCUMENT_TEMPLATES).map(([key, text]) => ({
      key, text, type: 'document',
      label:      TEMPLATES_META[key]?.label    || key,
      category:   TEMPLATES_META[key]?.category || 'Documents',
      isInfoOnly: !!TEMPLATES_META[key]?.isInfoOnly,
      noWrapper:  !!TEMPLATES_META[key]?.noWrapper,
    })),
    ...Object.entries(REJECTION_TEMPLATES).map(([key, text]) => ({
      key, text, type: 'rejection',
      label:    TEMPLATES_META[key]?.label || key,
      category: 'Rejection Reason',
    })),
  ];
}

exports.seedEmailTemplates = async function () {
  const json = require('../data/emailTemplates.json');
  const meta = json.meta || {};
  const docs = [];
  Object.entries(json.documentTemplates || {}).forEach(([key, text]) => {
    docs.push({ key, text, type: 'document', label: meta[key]?.label || key, category: meta[key]?.category || 'Documents', isInfoOnly: !!meta[key]?.isInfoOnly, noWrapper: !!meta[key]?.noWrapper });
  });
  Object.entries(json.rejectionTemplates || {}).forEach(([key, text]) => {
    docs.push({ key, text, type: 'rejection', label: meta[key]?.label || key, category: 'Rejection Reason', isInfoOnly: false, noWrapper: false });
  });

  const count = await EmailTemplate.countDocuments();
  if (count === 0) {
    await EmailTemplate.insertMany(docs);
    console.log(`[EmailTemplate] Seeded ${docs.length} templates from JSON`);
    return;
  }

  // Sync structural metadata (category, label, flags) without touching user-edited text
  const ops = docs.map(d => ({
    updateOne: {
      filter: { key: d.key },
      update: {
        $set: { type: d.type, category: d.category, label: d.label, isInfoOnly: d.isInfoOnly, noWrapper: d.noWrapper },
        $setOnInsert: { key: d.key, text: d.text },
      },
      upsert: true,
    },
  }));
  const result = await EmailTemplate.bulkWrite(ops);
  if (result.modifiedCount > 0 || result.upsertedCount > 0) {
    console.log(`[EmailTemplate] Synced metadata for ${result.modifiedCount} templates and inserted ${result.upsertedCount} new templates`);
  }
};

function buildOutro(selectedDocKeys, link, hasCustomNote) {
  const hasLinkTemplates = !!link && selectedDocKeys.some(k => LINK_TEMPLATE_KEYS.has(k));
  const nonLinkKeys      = selectedDocKeys.filter(k => !LINK_TEMPLATE_KEYS.has(k));
  const hasNonLink       = nonLinkKeys.length > 0 || hasCustomNote;

  const labelFor = (keys, includesCustom) => {
    const hasDocs = keys.some(k => !INFO_ONLY_TEMPLATE_KEYS.has(k));
    const hasInfo = keys.some(k =>  INFO_ONLY_TEMPLATE_KEYS.has(k)) || includesCustom;
    if (hasDocs && hasInfo) return 'documents and information';
    if (hasDocs) return 'documents';
    return 'information';
  };

  if (hasLinkTemplates && hasNonLink) {
    const label = labelFor(nonLinkKeys, hasCustomNote);
    return `Please upload the relevant documents through the link above and reply directly to this email with the remaining ${label} at your earliest convenience. Once we receive everything, our legal team will continue processing your compensation claim.`;
  }

  if (hasLinkTemplates && !hasNonLink) {
    return `Please upload all required documents through the link above at your earliest convenience. Once we receive them, our legal team will continue processing your compensation claim.`;
  }

  // All via email reply
  const label = labelFor(selectedDocKeys, hasCustomNote);
  return `Please reply directly to this email with the requested ${label} at your earliest convenience. Once we receive them, our legal team will continue processing your compensation claim.`;
}

function wrapWithTemplate(content, outro) {
  return `In order to proceed with your claim and process your compensation, we require the following information and documents:\n\n${content}\n\n${outro}`;
}

function deriveEmailTemplateFields(category) {
  const type = category === 'Rejection Reason' ? 'rejection' : 'document';
  return {
    type,
    isInfoOnly: type === 'document' && category === 'Others',
    noWrapper:  type === 'document' && category === 'Others',
  };
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

const { geminiQueue, isQuotaError } = require('../utils/geminiQueue');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ---------------------------------------------------------------------------
// IFRAME PROXY — strips X-Frame-Options / CSP for sites that block iframes
// but don't require login. Only whitelisted domains are allowed.
// ---------------------------------------------------------------------------

const PROXY_ALLOWED_HOSTS = new Set(['airportinfo.live']);

exports.proxyPage = async (req, res) => {
  try {
    const host = req.params.host;
    if (!host || !PROXY_ALLOWED_HOSTS.has(host)) {
      return res.status(403).send('Domain not allowed');
    }

    const restPath = Array.isArray(req.params.rest)
      ? '/' + req.params.rest.join('/')
      : req.params.rest ? `/${req.params.rest}` : '/';
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const targetUrl = `https://${host}${restPath}${qs}`;

    const upstream = await fetch(targetUrl, {
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
        'Accept': req.headers['accept'] || '*/*',
        'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
      },
      redirect: 'follow',
    });

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    const cacheControl = upstream.headers.get('cache-control');
    if (cacheControl) res.setHeader('Cache-Control', cacheControl);

    if (contentType.includes('text/html')) {
      const body = await upstream.text();
      const base = `https://${host}`;
      const patched = body
        .replace(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '')
        .replace(/(<head[^>]*>)/i, `$1<base href="${base}/">`);
      res.send(patched);
    } else {
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.send(buffer);
    }
  } catch (err) {
    console.error('[proxyPage]', err.message);
    res.status(502).send('Proxy error');
  }
};

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

exports.generateEmail = catchAsync(async (req, res, next) => {
  await loadTemplates();
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

  const docKeys = Object.keys(DOCUMENT_TEMPLATES);
  const rejKeys = Object.keys(REJECTION_TEMPLATES);

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

  const makeBullet = name => {
    let text = link
      ? DOCUMENT_TEMPLATES[name].replace(/\[link\]/g, link)
      : DOCUMENT_TEMPLATES[name];
    text = applyPlaceholders(text);
    return `• ${text}`;
  };

  const noWrapBullets = sortedSelected
    .filter(name => docKeys.includes(name) && NO_WRAPPER_DOC_KEYS.has(name))
    .map(makeBullet);

  const docTemplateBullets = sortedSelected
    .filter(name => docKeys.includes(name) && !NO_WRAPPER_DOC_KEYS.has(name))
    .map(makeBullet);

  let customNoteBullet = null;
  if (customNote?.trim()) {
    const noteRewritePrompt = `You are a claims specialist at ReFly, a flight compensation company writing to a passenger.\n\nRewrite the following note as a warm, professional sentence for a flight compensation claim email. Tone: human and considerate — the passenger may be in a stressful situation. Phrase it as a polite request or question, not a command. No filler phrases. No bullet point, no greeting, no sign-off. Output only the rewritten sentence.\n\n"${customNote.trim()}"`;
    try {
      generationResult = await geminiQueue.run(() => model.generateContent(noteRewritePrompt));
    } catch (err) {
      if (isQuotaError(err)) return next(new AppError('AI service is temporarily at capacity. Please try again in a moment.', 503));
      return next(new AppError(`Email generation failed: ${err.message}`, 502));
    }
    customNoteBullet = `• ${generationResult.response.text().trim()}`;
  }

  const sections = [];
  const rejectionText = selectedTemplates
    .filter(name => rejKeys.includes(name))
    .map(name => REJECTION_TEMPLATES[name])
    .join('\n\n');

  if (rejectionText) sections.push(rejectionText);
  if (noWrapBullets.length) sections.push(noWrapBullets.join('\n\n'));

  const allWrapBullets = [...docTemplateBullets, ...(customNoteBullet ? [customNoteBullet] : [])];
  if (allWrapBullets.length) {
    // Outro is automatic when doc templates are selected; for custom note alone it respects the useWrapper flag
    const addOutro = docTemplateBullets.length > 0 || (customNoteBullet && useWrapper);
    const wrapDocKeys = selectedTemplates.filter(name => docKeys.includes(name) && !NO_WRAPPER_DOC_KEYS.has(name));
    const outro = buildOutro(wrapDocKeys, link, !!customNoteBullet);
    const docSection = addOutro
      ? `${allWrapBullets.join('\n\n')}\n\n${outro}`
      : allWrapBullets.join('\n\n');
    sections.push(docSection);
  }

  const englishBody = sections.join('\n\n');

  // --- Translate if needed ---
  let email, englishTranslation = null;
  if (!isEnglish) {
    const translationPrompt = `You are a professional multilingual translator and flight compensation specialist.\n\nTranslate the following email content into ${language}.\n\nIMPORTANT: Output ONLY the translated content. No subject line, no explanatory text, no metadata.\n\n---\n${englishBody}\n---`;
    try {
      translationResult = await geminiQueue.run(() => model.generateContent(translationPrompt));
    } catch (err) {
      if (isQuotaError(err)) return next(new AppError('AI service is temporarily at capacity. Please try again in a moment.', 503));
      return next(new AppError(`Translation failed: ${err.message}`, 502));
    }
    email = translationResult.response.text().trim();
    englishTranslation = englishBody;
  } else {
    email = englishBody;
  }

  // --- Log usage ---
  const usageTotals = [generationResult, translationResult].reduce((totals, result) => {
    const usageMeta = result?.response?.usageMetadata || {};
    totals.iTok += usageMeta.promptTokenCount || 0;
    totals.oTok += usageMeta.candidatesTokenCount || 0;
    totals.tTok += usageMeta.thoughtsTokenCount || 0;
    return totals;
  }, { iTok: 0, oTok: 0, tTok: 0 });
  const { iTok, oTok, tTok } = usageTotals;
  const { MODEL_PRICING } = require('../utils/pricing');
  const emailRates = MODEL_PRICING['gemini-2.5-flash'];
  const emailCostUSD = (iTok / 1_000_000) * emailRates.input + ((oTok + tTok) / 1_000_000) * emailRates.output;
  logUsage(req, {
    operationType: 'email_translation',
    model: 'gemini-2.5-flash',
    inputTokens: iTok,
    outputTokens: oTok + tTok,
    costUSD: emailCostUSD,
    metadata: { language, mode }
  });

  res.status(200).json({ success: true, email, englishTranslation });
});

// ---------------------------------------------------------------------------
// EMAIL TEMPLATE CRUD
// ---------------------------------------------------------------------------

exports.getEmailTemplates = catchAsync(async (req, res) => {
  await loadTemplates();
  res.json({ success: true, templates: buildTemplateListSync() });
});

exports.createEmailTemplate = catchAsync(async (req, res, next) => {
  const { key, text, label } = req.body;
  const { category } = req.body;
  if (!key || !text || !category) return next(new AppError('key, text, and category are required', 400));
  const derived = deriveEmailTemplateFields(category);

  const existing = await EmailTemplate.findOne({ key });
  if (existing) return next(new AppError('A template with that key already exists', 409));

  await EmailTemplate.create({ key, text, type: derived.type, label: label || key, category, isInfoOnly: derived.isInfoOnly, noWrapper: derived.noWrapper });
  _templatesCached = false;
  await loadTemplates();
  res.json({ success: true, templates: buildTemplateListSync() });
});

exports.updateEmailTemplate = catchAsync(async (req, res, next) => {
  const { key, text, label } = req.body;
  const { category } = req.body;
  if (!key) return next(new AppError('key is required', 400));

  const existing = await EmailTemplate.findOne({ key });
  if (!existing) return next(new AppError('Template not found', 404));

  const update = {};
  if (text     !== undefined) update.text      = text;
  if (label    !== undefined) update.label     = label;
  if (category !== undefined) {
    update.category = category;
    update.type = deriveEmailTemplateFields(category).type;
    if (category !== existing.category) {
      const derived = deriveEmailTemplateFields(category);
      update.isInfoOnly = derived.isInfoOnly;
      update.noWrapper  = derived.noWrapper;
    }
  }

  if (Object.keys(update).length) {
    await EmailTemplate.updateOne({ key }, { $set: update }, { runValidators: true });
  }

  _templatesCached = false;
  await loadTemplates();
  res.json({ success: true, templates: buildTemplateListSync() });
});

exports.deleteEmailTemplate = catchAsync(async (req, res, next) => {
  const { key } = req.body;
  if (!key) return next(new AppError('key is required', 400));

  const result = await EmailTemplate.deleteOne({ key });
  if (!result.deletedCount) return next(new AppError('Template not found', 404));

  _templatesCached = false;
  await loadTemplates();
  res.json({ success: true, templates: buildTemplateListSync() });
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

