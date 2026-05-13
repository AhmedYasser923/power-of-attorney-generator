'use strict';

const sharp    = require('sharp');
const { PDFExtract } = require('pdf.js-extract');
const pdfExtract = new PDFExtract();

const catchAsync      = require('../utils/catchAsync');
const AppError        = require('../utils/appError');
const logUsage        = require('../utils/logUsage');
const { calculateCost } = require('../utils/pricing');
const { geminiQueue, isQuotaError } = require('../utils/geminiQueue');
const genAI = require('../utils/geminiClient');
const flightStatusService = require('../services/flightStatusService');
const eocService = require('../services/eocService');
const TICKET_RESPONSE_SCHEMA = require('../schemas/ticketResponseSchema');
const { buildTicketAnalysisPrompt } = require('../prompts/ticketAnalysisPrompt');
const {
  isEUCountry,
  evaluateEC261Deterministic,
  validateAndCorrectPNRs,
} = require('../services/ec261Service');

const airportsDatabase = require('../airports_data.json');

const {
  getJurisdictionLimit,
  getJurisdictionYears,
  getAirlineDocInfo,
} = require('../utils/dataLoader');

// ---------------------------------------------------------------------------
// ANALYZE TICKET
// ---------------------------------------------------------------------------
exports.analyzeTicket = catchAsync(async (req, res, next) => {
  const files       = req.files && req.files.length > 0 ? req.files : [];
  const journeyYear = req.body.journeyYear;

  if (files.length === 0) return next(new AppError('No files uploaded', 400));

  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

  let yearDirective = '';
  if (journeyYear) {
    yearDirective = `
🚨 FALLBACK YEAR PROVIDED BY USER: ${journeyYear}
CRITICAL PRIORITY RULE:
1. If the flight date EXPLICITLY shows a 4-digit year, use the year FROM THE DOCUMENT. NEVER replace it with ${journeyYear}.
2. If the flight date shows ONLY day and month with NO year, THEN use ${journeyYear} and output "${journeyYear}-MM-DD".
3. If no date at all is visible, output an empty string.
The user-supplied year ${journeyYear} is a safety net, NOT an override. Document years always take precedence.`;
  }

  const rawPrompt = buildTicketAnalysisPrompt(yearDirective, journeyYear);
  const prompt = rawPrompt.replace(/\s+/g, ' ').trim();
  const documentParts = [];

  for (const file of files) {
    if (file.mimetype === 'application/pdf') {
      try {
        const data = await pdfExtract.extractBuffer(file.buffer);
        const text = data.pages.map(p => p.content.map(i => i.str).join(' ')).join('\n').trim();
        if (text.length > 100) {
          console.log(`[PDF] Digital (${text.length} chars) → text part.`);
          documentParts.push({ text: `[PDF text content]\n${text}` });
        } else throw new Error(`Insufficient text (${text.length} chars)`);
      } catch (pdfErr) {
        console.log(`[PDF] Scanned → inlineData.`);
        documentParts.push({ inlineData: { data: file.buffer.toString('base64'), mimeType: 'application/pdf' } });
      }
    } else if (file.mimetype.startsWith('image/')) {
      const processed = await sharp(file.buffer).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
      documentParts.push({ inlineData: { data: processed.toString('base64'), mimeType: 'image/jpeg' } });
    } else {
      documentParts.push({ inlineData: { data: file.buffer.toString('base64'), mimeType: file.mimetype } });
    }
  }

  const startTime = Date.now();
  let result;
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`⏳ Gemini API attempt ${attempt + 1}...`);
      result = await geminiQueue.run(() => model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }, ...documentParts] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: TICKET_RESPONSE_SCHEMA },
      }));
      console.log('✅ Gemini response received.');
      break;
    } catch (apiError) {
      if (attempt === maxRetries) {
        console.error('🔥 GEMINI API CRASHED:', apiError);
        if (isQuotaError(apiError)) return next(new AppError('AI service is temporarily at capacity. Please try again in a moment.', 503));
        return next(new AppError(`AI Processing Failed after 3 attempts: ${apiError.message}`, 500));
      }
      const wait = (attempt + 1) * 2000;
      console.warn(`[Gemini] ${apiError.message} — retry in ${wait/1000}s`);
      await new Promise(r => setTimeout(r, wait));
    }
  }

  const processingTimeInSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
  let requestCostUSD = 0;
  let costData = { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, costUSD: 0 };
  if (result.response.usageMetadata) {
    costData = calculateCost('gemini-3-flash-preview', result.response.usageMetadata);
    requestCostUSD = costData.costUSD;
    console.log(`\n========= ANALYZED IN ${processingTimeInSeconds}s | 📥 ${costData.inputTokens.toLocaleString()} in / 📤 ${costData.outputTokens.toLocaleString()} out / 💭 ${costData.thinkingTokens.toLocaleString()} think | 💸 $${requestCostUSD.toFixed(6)}\n`);
  }

  const formattedCostUSD = `$${requestCostUSD.toFixed(6)}`;

  let parsedJourneys;
  try {
    parsedJourneys = JSON.parse(result.response.text());
  } catch (parseErr) {
    return next(new AppError('The AI returned an unparseable response. Please try again.', 502));
  }

  if (!Array.isArray(parsedJourneys) || parsedJourneys.length === 0) {
    return res.json({ noFlightData: true, processingTime: processingTimeInSeconds, costUSD: formattedCostUSD, journeys: [] });
  }

  // BUG 2 FIX: Run deterministic EC261 evaluator BEFORE per-leg post-processing.
  // This overwrites whatever the AI guessed with bullet-proof server-side logic.
  evaluateEC261Deterministic(parsedJourneys);

  // BUG 1 FIX: Validate PNR assignments across multi-carrier bookings
  validateAndCorrectPNRs(parsedJourneys);

  parsedJourneys.forEach(journey => {
    if (!journey.routes) return;
    journey.routes.forEach(route => {
      if (!route.legs) return;
      route.legs.forEach(leg => {

        // BUG FIX: Strip dates from time fields if AI contaminated them
        const timeFields = ['departureTime', 'arrivalTime', 'originalDepartureTime', 'originalArrivalTime'];
        timeFields.forEach(field => {
          if (!leg[field]) return;

          const val = String(leg[field]).trim();

          // Detect ISO datetime format (e.g., "2026-03-29T11:59:00")
          const isoMatch = val.match(/T(\d{2}:\d{2})/);
          if (isoMatch) {
            console.warn(`⚠️  [TIME SANITIZER] Detected ISO datetime in ${field}: "${val}"`);
            leg[field] = isoMatch[1];  // Extract time portion
            console.warn(`    → Cleaned to: "${leg[field]}"`);
            return;
          }

          // Detect "HH:MM:SS" format (strip seconds)
          const secondsMatch = val.match(/^(\d{2}:\d{2}):\d{2}$/);
          if (secondsMatch) {
            leg[field] = secondsMatch[1];
            return;
          }

          // Detect date contamination patterns
          // e.g., "29 March 11:59", "March 29 at 11:59"
          const dateTimeMatch = val.match(/(\d{1,2}:\d{2})\s*(AM|PM)?$/i);
          if (dateTimeMatch && val.length > 10) {
            // If string is long and contains time at the end, extract just the time
            console.warn(`⚠️  [TIME SANITIZER] Detected date+time mix in ${field}: "${val}"`);
            let cleanTime = dateTimeMatch[1];

            // Handle AM/PM conversion if needed
            if (dateTimeMatch[2]) {
              const [hours, mins] = cleanTime.split(':').map(Number);
              if (dateTimeMatch[2].toUpperCase() === 'PM' && hours < 12) {
                cleanTime = `${hours + 12}:${mins.toString().padStart(2, '0')}`;
              } else if (dateTimeMatch[2].toUpperCase() === 'AM' && hours === 12) {
                cleanTime = `00:${mins.toString().padStart(2, '0')}`;
              }
            }

            leg[field] = cleanTime;
            console.warn(`    → Cleaned to: "${leg[field]}"`);
          }
        });

        if (Array.isArray(leg.flightNumbers)) {
          const cleaned = leg.flightNumbers.map(fn => fn.replace(/[\s-]/g,'').trim()).filter(Boolean);
          const merged = [];
          for (let i = 0; i < cleaned.length; i++) {
            if (i < cleaned.length - 1 && /^[A-Za-z0-9]{2,3}$/.test(cleaned[i]) && /^\d{1,4}$/.test(cleaned[i+1])) {
              merged.push(cleaned[i] + cleaned[i+1]); i++;
            } else merged.push(cleaned[i]);
          }
          leg.flightNumbers = merged;
        }

        const oIata = (leg.originIata || '').toUpperCase();
        const dIata = (leg.destinationIata || '').toUpperCase();
        const originPort = airportsDatabase.find(a => a.iata && a.iata.toUpperCase() === oIata);
        const destPort   = airportsDatabase.find(a => a.iata && a.iata.toUpperCase() === dIata);
        leg.ec261Leg = leg.ec261Leg || {};

        if (originPort && destPort) {
          const R = 6371, dLat = (destPort.lat - originPort.lat) * Math.PI / 180, dLon = (destPort.lon - originPort.lon) * Math.PI / 180;
          const a = Math.sin(dLat/2)**2 + Math.cos(originPort.lat*Math.PI/180) * Math.cos(destPort.lat*Math.PI/180) * Math.sin(dLon/2)**2;
          const dist = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
          leg.distanceKm = `${dist} km`;
          const isIntra = isEUCountry(leg.originCountry) && isEUCountry(leg.destinationCountry);
          leg.ec261Leg.estimatedClaimValue = dist <= 1500 ? '€250' : (isIntra || dist <= 3500) ? '€400' : '€600';
        } else { leg.distanceKm = 'Unknown'; leg.ec261Leg.estimatedClaimValue = 'N/A'; }

        const marketing = leg.marketingAirline || 'Unknown';
        const operating = leg.operatingAirline || marketing;
        const opCo = (leg.operatingAirlineCountry||'').toLowerCase().trim(), opLimRaw = getJurisdictionLimit(opCo);
        const mktCo = (leg.marketingAirlineCountry||'').toLowerCase().trim(), mktLimRaw = getJurisdictionLimit(mktCo);
        const dispOp  = leg.operatingAirlineCountry && leg.operatingAirlineCountry !== 'Unknown' ? leg.operatingAirlineCountry : 'Unknown HQ';
        const dispMkt = leg.marketingAirlineCountry && leg.marketingAirlineCountry !== 'Unknown' ? leg.marketingAirlineCountry : 'Unknown HQ';

        const mktInfo = getAirlineDocInfo(marketing, {
          flightNumbers: leg.flightNumbers,
          country: leg.marketingAirlineCountry,
        });
        const opInfo  = getAirlineDocInfo(operating, {
          flightNumbers: leg.flightNumbers,
          country: leg.operatingAirlineCountry,
        });

        leg.claimDocuments = marketing === operating
          ? [{
              airline: marketing,
              role: '',
              reqs: mktInfo.reqs,
              hq: dispOp,
              limit: opLimRaw !== 'N/A' ? `${opLimRaw} years` : 'N/A',
              iata: mktInfo.iata,
              icao: mktInfo.icao,
              ticketNumberCanReplacePnr: mktInfo.ticketNumberCanReplacePnr,
              claimNote: mktInfo.claimNote,
              oneTimeSubmission: mktInfo.oneTimeSubmission,
              ceasedOperations: mktInfo.ceasedOperations,
            }]
          : [
              {
                airline: marketing,
                role: 'Booked',
                reqs: mktInfo.reqs,
                hq: dispMkt,
                limit: mktLimRaw !== 'N/A' ? `${mktLimRaw} years` : 'N/A',
                iata: mktInfo.iata,
                icao: mktInfo.icao,
                ticketNumberCanReplacePnr: mktInfo.ticketNumberCanReplacePnr,
                claimNote: mktInfo.claimNote,
                oneTimeSubmission: mktInfo.oneTimeSubmission,
                ceasedOperations: mktInfo.ceasedOperations,
              },
              {
                airline: operating,
                role: 'Operated',
                reqs: opInfo.reqs,
                hq: dispOp,
                limit: opLimRaw  !== 'N/A' ? `${opLimRaw} years`  : 'N/A',
                iata: opInfo.iata,
                icao: opInfo.icao,
                ticketNumberCanReplacePnr: opInfo.ticketNumberCanReplacePnr,
                claimNote: opInfo.claimNote,
                oneTimeSubmission: opInfo.oneTimeSubmission,
                ceasedOperations: opInfo.ceasedOperations,
              },
            ];

        if (leg.ec261Leg?.claimExpiration) {
          const oL = getJurisdictionLimit((leg.originCountry||'').toLowerCase().trim());
          const dL = getJurisdictionLimit((leg.destinationCountry||'').toLowerCase().trim());
          leg.ec261Leg.claimExpiration.originYears           = oL;
          leg.ec261Leg.claimExpiration.destinationYears      = dL;
          leg.ec261Leg.claimExpiration.operatingAirlineYears = opLimRaw;
          leg.ec261Leg.claimExpiration.marketingAirlineYears = mktLimRaw;

          let best = 0, bestName = 'Unknown';
          for (const { limit, name } of [
            { limit: oL,        name: leg.originCountry },
            { limit: dL,        name: leg.destinationCountry },
            { limit: opLimRaw,  name: leg.operatingAirlineCountry },
            { limit: mktLimRaw, name: leg.marketingAirlineCountry },
          ]) {
            const n = typeof limit === 'number' ? limit : null;
            if (n !== null && n > best) { best = n; bestName = name; }
          }

          // BUG 3 FIX: Always set bestYears/bestCountry when we have a limit,
          // even if the date is currently missing. This lets the frontend date
          // editor calculate expiry correctly once the user supplies a date.
          if (best > 0) {
            leg.ec261Leg.claimExpiration.bestYears   = best;
            leg.ec261Leg.claimExpiration.bestCountry = bestName;
            if (leg.date && leg.date !== 'Unknown') {
              const fd = new Date(leg.date);
              if (!isNaN(fd.getTime())) {
                fd.setFullYear(fd.getFullYear() + best);
                leg.ec261Leg.claimExpiration.expirationDate = fd.toISOString().split('T')[0];
                leg.ec261Leg.claimExpiration.isExpired      = new Date() > fd;
              } else {
                leg.ec261Leg.claimExpiration.expirationDate = 'N/A';
                leg.ec261Leg.claimExpiration.isExpired      = false;
              }
            } else {
              // Date missing — expiry deferred to frontend date editor
              leg.ec261Leg.claimExpiration.expirationDate = 'N/A';
              leg.ec261Leg.claimExpiration.isExpired      = false;
            }
          } else {
            leg.ec261Leg.claimExpiration.bestYears      = 'N/A';
            leg.ec261Leg.claimExpiration.bestCountry    = 'N/A';
            leg.ec261Leg.claimExpiration.expirationDate = 'N/A';
            leg.ec261Leg.claimExpiration.isExpired      = false;
          }
        }
      });
    });
  });

  logUsage(req, {
    operationType: 'ticket_analysis',
    model: 'gemini-3-flash-preview',
    inputTokens: costData.inputTokens,
    outputTokens: costData.outputTokens + costData.thinkingTokens,
    costUSD: costData.costUSD,
    metadata: { fileCount: (req.files || []).length }
  });

  res.json({ processingTime: processingTimeInSeconds, costUSD: formattedCostUSD, journeys: parsedJourneys });
});

// ---------------------------------------------------------------------------
// EOC CHECK
// ---------------------------------------------------------------------------
exports.checkEOC = async (req, res, next) => {
  try {
    const result = await eocService.findEOCEvents(req.query);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// FLIGHT STATUS (Cirium) — unchanged
// ---------------------------------------------------------------------------
exports.checkFlightStatus = async (req, res, next) => {
  const result = await flightStatusService.getFlightStatus(req.query);
  res.json(result);
};
