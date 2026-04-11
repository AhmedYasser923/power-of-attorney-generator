'use strict';

const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const sharp    = require('sharp');
const { PDFExtract } = require('pdf.js-extract');
const pdfExtract = new PDFExtract();

const catchAsync = require('../utils/catchAsync');
const AppError   = require('../utils/appError');

const eocDatabase      = require('../eoc_data.json');
const airportsDatabase = require('../airports_data.json');

const {
  getJurisdictionLimit,
  getJurisdictionYears,
  getAirlineReqs,
} = require('../utils/dataLoader');

console.log(`[EOC Database] Successfully loaded ${eocDatabase.length} records from JSON.`);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ---------------------------------------------------------------------------
// RESPONSE SCHEMA (unchanged)
// ---------------------------------------------------------------------------
const TICKET_RESPONSE_SCHEMA = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      _chronology_scratchpad: {
        type: SchemaType.STRING,
        description: "MENTAL WORKSPACE: Write out a flat chronological timeline of all flights extracted. Identical boarding passes must be completely merged into one leg. Determine Outbound vs Return structure."
      },
      passengers: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            firstName:    { type: SchemaType.STRING },
            lastName:     { type: SchemaType.STRING },
            ticketNumber: { type: SchemaType.STRING, description: 'STRICTLY 13 NUMERIC DIGITS. NO LETTERS. Output "Not Provided" if missing.' },
          },
          required: ['firstName', 'lastName', 'ticketNumber'],
        },
      },
      ec261: {
        type: SchemaType.OBJECT,
        properties: {
          firstOriginCountry:      { type: SchemaType.STRING },
          finalDestinationCountry: { type: SchemaType.STRING },
          status:                  { type: SchemaType.STRING },
          reason:                  { type: SchemaType.STRING },
        },
        required: ['firstOriginCountry', 'finalDestinationCountry', 'status', 'reason'],
      },
      routes: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            type: { type: SchemaType.STRING, description: 'Outbound or Return' },
            legs: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  printedReference: { type: SchemaType.STRING, description: 'Raw alphanumeric reference physically printed on the document. Output "Not Provided" if absent.' },
                  pnr: { type: SchemaType.STRING },
                  flightStatus: { type: SchemaType.STRING, description: 'One of: Cancelled | Unused / Missed Connection | Rescheduled | Replacement Flight | Unused Replacement Flight | Flown | Scheduled' },
                  marketingAirline:        { type: SchemaType.STRING },
                  marketingAirlineCountry: { type: SchemaType.STRING },
                  operatingAirline:        { type: SchemaType.STRING },
                  operatingAirlineCountry: { type: SchemaType.STRING },
                  flightNumbers:    { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                  originIata:         { type: SchemaType.STRING },
                  originName:         { type: SchemaType.STRING },
                  originCity:         { type: SchemaType.STRING },
                  originCountry:      { type: SchemaType.STRING },
                  departureTime:      { type: SchemaType.STRING },
                  arrivalTime:        { type: SchemaType.STRING },
                  destinationIata:    { type: SchemaType.STRING },
                  destinationName:    { type: SchemaType.STRING },
                  destinationCity:    { type: SchemaType.STRING },
                  destinationCountry: { type: SchemaType.STRING },
                  rawExtractedDate:   { type: SchemaType.STRING },
                  date:               { type: SchemaType.STRING },
                  originalDepartureTime: { type: SchemaType.STRING },
                  originalArrivalTime:   { type: SchemaType.STRING },
                  passengerTickets: {
                    type: SchemaType.ARRAY,
                    description: "List of exactly which ticket numbers were used for this specific leg, mapped to each passenger's name.",
                    items: {
                      type: SchemaType.OBJECT,
                      properties: {
                        passengerName: { type: SchemaType.STRING },
                        ticketNumber: { type: SchemaType.STRING }
                      },
                      required: ['passengerName', 'ticketNumber']
                    }
                  },
                  ec261Leg: {
                    type: SchemaType.OBJECT,
                    properties: {
                      legOriginCountry:      { type: SchemaType.STRING },
                      legDestinationCountry: { type: SchemaType.STRING },
                      status:                { type: SchemaType.STRING },
                      reason:                { type: SchemaType.STRING },
                      claimExpiration: {
                        type: SchemaType.OBJECT,
                        properties: {
                          originYears:           { type: SchemaType.STRING },
                          destinationYears:      { type: SchemaType.STRING },
                          marketingAirlineYears: { type: SchemaType.STRING },
                          operatingAirlineYears: { type: SchemaType.STRING },
                          bestCountry:           { type: SchemaType.STRING },
                          bestYears:             { type: SchemaType.STRING },
                          expirationDate:        { type: SchemaType.STRING },
                          isExpired:             { type: SchemaType.BOOLEAN },
                        },
                        required: ['originYears','destinationYears','marketingAirlineYears','operatingAirlineYears','bestCountry','bestYears','expirationDate','isExpired'],
                      },
                    },
                    required: ['legOriginCountry','legDestinationCountry','status','reason','claimExpiration'],
                  },
                },
                required: ['passengerTickets','printedReference','pnr','flightStatus','marketingAirline','marketingAirlineCountry','operatingAirline','operatingAirlineCountry','flightNumbers','originIata','originName','originCity','originCountry','departureTime','arrivalTime','destinationIata','destinationName','destinationCity','destinationCountry','rawExtractedDate','date','originalDepartureTime','originalArrivalTime','ec261Leg'],
              },
            },
          },
          required: ['type', 'legs'],
        },
      },
    },
    required: ['_chronology_scratchpad', 'passengers', 'ec261', 'routes'],
  },
};

// ---------------------------------------------------------------------------
// BUG 2 FIX — DETERMINISTIC EC261/UK261 EVALUATOR
// Runs server-side after AI extraction; overwrites AI eligibility with
// bullet-proof rules so it's always correct regardless of AI output.
// ---------------------------------------------------------------------------
const EC261_EU_COUNTRIES = new Set([
  'austria','belgium','bulgaria','croatia','cyprus','czech republic','denmark',
  'estonia','finland','france','germany','greece','hungary','ireland','italy',
  'latvia','lithuania','luxembourg','malta','netherlands','the netherlands',
  'poland','portugal','romania','slovakia','slovenia','spain','sweden',
  'iceland','norway','switzerland',
  // UK
  'united kingdom','uk','england','scotland','wales','northern ireland',
  // EU overseas territories covered by EC261
  'canary islands','madeira','azores','guadeloupe','martinique',
  'french guiana','réunion','reunion','mayotte','saint martin',
]);

function isEUCountry(country) {
  return EC261_EU_COUNTRIES.has((country || '').toLowerCase().trim());
}

function evaluateEC261Deterministic(parsedJourneys) {
  parsedJourneys.forEach(journey => {
    if (!journey.routes) return;

    const allLegs = journey.routes.flatMap(r => r.legs || []);
    if (!allLegs.length) return;

    journey.ec261 = journey.ec261 || {};
    journey.ec261.firstOriginCountry      = allLegs[0].originCountry     || 'Unknown';
    journey.ec261.finalDestinationCountry = allLegs[allLegs.length - 1].destinationCountry || 'Unknown';

    let anyEligible = false;
    let anyIneligible = false;

    journey.routes.forEach(route => {
      const routeLegs = route.legs || [];
      if (!routeLegs.length) return;

      const routeFirstLeg      = routeLegs[0];
      const routeLastLeg       = routeLegs[routeLegs.length - 1];
      const routeFirstOriginEU = isEUCountry(routeFirstLeg.originCountry);
      const routeLastDestEU    = isEUCountry(routeLastLeg.destinationCountry);

      // RULE 1: EU/UK origin -> entire route automatically eligible
      if (routeFirstOriginEU) {
        routeLegs.forEach(leg => {
          leg.ec261Leg        = leg.ec261Leg || {};
          leg.ec261Leg.status = 'Eligible';
          leg.ec261Leg.reason = `Route departs from EU/UK (${routeFirstLeg.originCountry}). EC261/2004 applies automatically to all legs on this route.`;
        });
        anyEligible = true;
        return; // continue to next route
      }

      // RULE 2: Non-EU origin AND non-EU final destination -> entirely ineligible
      if (!routeLastDestEU) {
        routeLegs.forEach(leg => {
          leg.ec261Leg        = leg.ec261Leg || {};
          leg.ec261Leg.status = 'Not Eligible';
          leg.ec261Leg.reason = 'Not Covered: Both the route origin and final destination are outside the EU/UK.';
        });
        anyIneligible = true;
        return; // continue to next route
      }

      // RULE 3: Non-EU origin, EU/UK destination -> per-leg evaluation
      routeLegs.forEach(leg => {
        leg.ec261Leg = leg.ec261Leg || {};
        const oEU     = isEUCountry(leg.originCountry);
        const dEU     = isEUCountry(leg.destinationCountry);
        const opEU    = isEUCountry(leg.operatingAirlineCountry);
        const opName  = leg.operatingAirline        || 'Unknown carrier';
        const opCtry  = leg.operatingAirlineCountry || 'unknown country';

        if (oEU) {
          // Leg departs from EU/UK -> always eligible regardless of carrier
          leg.ec261Leg.status = 'Eligible';
          leg.ec261Leg.reason = `Departs from EU/UK (${leg.originCountry}) — eligible regardless of carrier.`;
          anyEligible = true;
        } else if (dEU) {
          // Non-EU -> EU: eligible ONLY if operated by an EU/UK carrier
          if (opEU) {
            leg.ec261Leg.status = 'Eligible';
            leg.ec261Leg.reason = `Arrives in EU/UK (${leg.destinationCountry}) and operated by EU/UK carrier ${opName} (${opCtry}).`;
            anyEligible = true;
          } else {
            leg.ec261Leg.status = 'Not Eligible';
            leg.ec261Leg.reason = `Arrives in EU/UK (${leg.destinationCountry}) but operated by non-EU/UK carrier ${opName} (${opCtry}).`;
            anyIneligible = true;
          }
        } else {
          // Non-EU -> Non-EU connecting leg
          leg.ec261Leg.status = 'Not Eligible';
          leg.ec261Leg.reason = `Both origin (${leg.originCountry}) and destination (${leg.destinationCountry}) are outside the EU/UK.`;
          anyIneligible = true;
        }
      });
    });

    if (anyEligible && anyIneligible) {
      journey.ec261.status = 'Partially Eligible';
      journey.ec261.reason = 'This booking contains a mix of eligible and ineligible legs under EC261/2004. See per-leg breakdown below.';
    } else if (anyEligible) {
      journey.ec261.status = 'Eligible';
      journey.ec261.reason = 'All routes in this booking qualify for EC261/2004 compensation.';
    } else {
      journey.ec261.status = 'Not Eligible';
      journey.ec261.reason = 'No routes or legs in this booking qualify for EC261/2004 compensation.';
    }
  });
}

// ---------------------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------------------
exports.renderAnalyzer = catchAsync(async (req, res, next) => {
  res.render('ticket-analyzer', { title: 'Ticket Analyzer' });
});

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

  const rawPrompt = `
    You are an expert aviation data extractor. Analyze ALL the attached travel document(s). Try not to exceed 40s.
    ${yearDirective}

    🚨 CROSS-DOCUMENT YEAR PROPAGATION (CRITICAL):
    When multiple documents describe the SAME flight leg (same flight number + same route):
    - If one document shows a complete date WITH year (e.g. "25 Mar 2024") and another shows the SAME leg
      with only day/month (e.g. "25 Mar"), you MUST output the full YYYY-MM-DD date for that leg everywhere.
    - Scan ALL uploaded documents first, build a map of "flight number → full date", then use that map
      to fill in missing years across all documents before outputting JSON.

  🧠 *THE ANALYTICAL FRAMEWORK (CHAIN OF THOUGHT)*
    Before populating the rest of the JSON, you must mentally process the documents using this exact sequence inside the _chronology_scratchpad field:
    1. Entity Grouping: Identify all unique passengers. If multiple passengers share the exact same flight numbers, dates, and routes, treat them as a single traveling party.
    2. Chronological Sequencing: Extract every single flight leg shown across all documents and arrange them strictly by Date and Departure Time to build a master timeline. FLIGHTS WITH THE SAME PNR SHOULD BE GROUPED TOGETHER IN IT'S OWN JOURNEY.
    3. 🚨 STRICT DEDUPLICATION (CRITICAL): If multiple uploaded images represent the exact same flight (same passenger, date, flight number), treat them as duplicate evidence. MERGE THEM. NEVER output identical flight legs for the same passenger.
    4. Anomaly Detection & Route Classification: 
       - Outbound: The sequence of flights heading towards a primary destination. Even if there are 3 layovers, next-day reroutes, or missed connections trying to reach that destination, they all belong in the Outbound route.
       - Return: Flights traveling back toward the original starting country at a noticeably later date. If the ticket is one-way, everything is Outbound.

    CRITICAL DATE RULES:
    1. Every flight has its own unique date — extract it from the document, put it in rawExtractedDate.
    2. "Issue Date" / "Booking Date" / "Printed Date" is NEVER the flight date. Ignore completely.
    3. If only day+month shown (e.g. "25 Mar"), output exactly that — no year assumption.

    🚨 JOURNEY SPLITTING:
    RULE 1 - SELF-TRANSFER: if you see "Self-transfer" / "Separate tickets" → split at that layover, each chunk is an INDEPENDENT journey.
    RULE 2 - STANDARD CONNECTIONS: normal layovers without self-transfer keywords → keep in SAME journey.
    RULE 3 - ROUND TRIPS: A→B then B→A at later date → TWO journey objects (Outbound + Return).
    RULE 4 - PASSENGER GROUPING: same flights, different PNRs → ONE journey, PNR field = "PNR1 (Name) / PNR2 (Name)".

    FLIGHT STATUS RULES (mutually exclusive — pick the FIRST that matches):
    "Cancelled" → airline unilaterally cancelled, flight never operated.
    "Unused / Missed Connection" → flight operated but passenger didn't board. 🚨 DEDUCTIVE RULE: If a passenger has a ticket for A ➔ B, but the timeline shows them flying out of city A later on a different flight (A ➔ C), the original A ➔ B flight was obviously unused/replaced and MUST be tagged as "Unused / Missed Connection" or "Cancelled".
    "Rescheduled" → SAME flight number, different time; populate originalDepartureTime + originalArrivalTime.
    "Replacement Flight" → a new alternative routing (like the A ➔ C flight from the example above) that replaces the disrupted one.
    "Unused Replacement Flight" → replacement issued but also not boarded.
    "Flown" → passenger successfully completed this flight.
    "Scheduled" → default, no disruption evidence.
    KEY: If the timeline proves A→B was abandoned for a reroute, tag A→B as "Unused / Missed Connection".

    PASSENGER & TICKET EXTRACTION:
       - Passengers Array: Extract each passenger and map their *primary/original* 13-digit e-ticket number in the top-level passenger array. E-tickets are universally 13 digits and purely numeric.
       - 🚨 PER-LEG TICKETS (CRITICAL): During reroutes or disruptions, airlines reissue new ticket numbers for specific flight legs! For EVERY SINGLE leg in the 'legs' array, you MUST populate 'passengerTickets' mapping each passenger's name to the exact 13-digit ticket number physically printed on the document for THAT specific leg. This ensures we track exactly which ticket got them on which plane.

    🚨 PNR EXTRACTION & JOURNEY GROUPING (CRITICAL) : 
    - TRUE PNR: A standard airline PNR is usually 5 to 6 alphanumeric characters (or 7 for EasyJet). 
    - AIRLINE EXCEPTIONS: Air Arabia Maroc, Arkia Israel, Condor, Electra Airways (8 Numbers). TUI Airways (up to 12 Numbers). Fly Jinnah (9 Numbers). Corendon Dutch Airlines (7 Numbers). Neos, Heston, Sunclass (pure numerical).
    - PRINTED REF MISMATCH: Generic alphanumeric strings like "7464F99C" or "LXC6A4E3" that are 8 letters/numbers are internal IDs, NOT PNRs! Unless the airline matches an exception above, if you cannot find a standard 5-7 character PNR, you MUST output "Not Provided". DO NOT use long printed references as a fallback PNR.
    - EMBEDDED PNRS: If you see the PNR hidden inside a longer pseudo e-ticket string (e.g., in "LH220HABMTTA4"), extract ONLY the core 6 characters ("HABMTT").
    - JOURNEY GROUPING RULE: It is absolutely crucial that you group flights by PNR. HOWEVER, if PNRs are "Not Provided", group the flights by Passenger Name and contiguous chronological routing instead of blindly splitting them.

    EC261 FIELDS: For ec261 object output status="Pending" and reason="Pending" — server recalculates.
    Just focus on accurate country names in every leg's originCountry, destinationCountry,
    operatingAirlineCountry, marketingAirlineCountry.

    FLIGHT NUMBERS: Remove ALL spaces and hyphens within a number. "6E 2" → "6E2". Never split one number into two array items.

     
  `;

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
      result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }, ...documentParts] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: TICKET_RESPONSE_SCHEMA },
      });
      console.log('✅ Gemini response received.');
      break;
    } catch (apiError) {
      if (attempt === maxRetries) {
        console.error('🔥 GEMINI API CRASHED:', apiError);
        return next(new AppError(`AI Processing Failed after 3 attempts: ${apiError.message}`, 500));
      }
      const wait = (attempt + 1) * 2000;
      console.warn(`[Gemini] ${apiError.message} — retry in ${wait/1000}s`);
      await new Promise(r => setTimeout(r, wait));
    }
  }

  const processingTimeInSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
  let requestCostUSD = 0, requestCostEGP = 0;
  if (result.response.usageMetadata) {
    const { promptTokenCount: i = 0, candidatesTokenCount: o = 0 } = result.response.usageMetadata;
    requestCostUSD = (i / 1_000_000) * 0.075 + (o / 1_000_000) * 0.30;
    requestCostEGP = requestCostUSD * 54.33;
    console.log(`\n========= ANALYZED IN ${processingTimeInSeconds}s | 📥 ${i.toLocaleString()} in / 📤 ${o.toLocaleString()} out | 💸 $${requestCostUSD.toFixed(6)}\n`);
  }

  const formattedCostUSD = `$${requestCostUSD.toFixed(6)}`;
  const formattedCostEGP = `£${requestCostEGP.toFixed(6)}`;

  let parsedJourneys;
  try {
    parsedJourneys = JSON.parse(result.response.text());
  } catch (parseErr) {
    return next(new AppError('The AI returned an unparseable response. Please try again.', 502));
  }

  if (!Array.isArray(parsedJourneys) || parsedJourneys.length === 0) {
    return res.json({ noFlightData: true, processingTime: processingTimeInSeconds, costUSD: formattedCostUSD, costEGP: formattedCostEGP, journeys: [] });
  }

  // BUG 2 FIX: Run deterministic EC261 evaluator BEFORE per-leg post-processing.
  // This overwrites whatever the AI guessed with bullet-proof server-side logic.
  evaluateEC261Deterministic(parsedJourneys);

  parsedJourneys.forEach(journey => {
    if (!journey.routes) return;
    journey.routes.forEach(route => {
      if (!route.legs) return;
      route.legs.forEach(leg => {

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
          const eu = ['austria','belgium','bulgaria','croatia','cyprus','czech republic','denmark','estonia','finland','france','germany','greece','hungary','ireland','italy','latvia','lithuania','luxembourg','malta','netherlands','the netherlands','poland','portugal','romania','slovakia','slovenia','spain','sweden','iceland','norway','switzerland','united kingdom','uk'];
          const isIntra = eu.includes((leg.originCountry||'').toLowerCase().trim()) && eu.includes((leg.destinationCountry||'').toLowerCase().trim());
          leg.ec261Leg.estimatedClaimValue = dist <= 1500 ? '€250' : (isIntra || dist <= 3500) ? '€400' : '€600';
        } else { leg.distanceKm = 'Unknown'; leg.ec261Leg.estimatedClaimValue = 'N/A'; }

        const marketing = leg.marketingAirline || 'Unknown';
        const operating = leg.operatingAirline || marketing;
        const opCo = (leg.operatingAirlineCountry||'').toLowerCase().trim(), opLimRaw = getJurisdictionLimit(opCo);
        const mktCo = (leg.marketingAirlineCountry||'').toLowerCase().trim(), mktLimRaw = getJurisdictionLimit(mktCo);
        const dispOp  = leg.operatingAirlineCountry && leg.operatingAirlineCountry !== 'Unknown' ? leg.operatingAirlineCountry : 'Unknown HQ';
        const dispMkt = leg.marketingAirlineCountry && leg.marketingAirlineCountry !== 'Unknown' ? leg.marketingAirlineCountry : 'Unknown HQ';

        leg.claimDocuments = marketing === operating
          ? [{ airline: marketing, role: '', reqs: getAirlineReqs(marketing), hq: dispOp, limit: opLimRaw !== 'N/A' ? `${opLimRaw} years` : 'N/A' }]
          : [
              { airline: marketing, role: 'Booked',   reqs: getAirlineReqs(marketing), hq: dispMkt, limit: mktLimRaw !== 'N/A' ? `${mktLimRaw} years` : 'N/A' },
              { airline: operating, role: 'Operated', reqs: getAirlineReqs(operating),  hq: dispOp,  limit: opLimRaw  !== 'N/A' ? `${opLimRaw} years`  : 'N/A' },
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

  res.json({ processingTime: processingTimeInSeconds, costUSD: formattedCostUSD, costEGP: formattedCostEGP, journeys: parsedJourneys });
});

// ---------------------------------------------------------------------------
// EOC CHECK
// ---------------------------------------------------------------------------
exports.checkEOC = (req, res, next) => {
  try {
    const { date, originIata, destIata, originCountry, destCountry } = req.query;
    if (!date || date === 'Unknown') return res.json({ eocFound: false });
    const oI = (originIata||'').toLowerCase(), dI = (destIata||'').toLowerCase();
    const oC = (originCountry||'').toLowerCase(), dC = (destCountry||'').toLowerCase();
    const fd = new Date(date);
    const matched = eocDatabase.filter(eoc => {
      const loc = (eoc.location||'').toLowerCase();
      if (![oI,dI,oC,dC,'world wide'].includes(loc)) return false;
      return (eoc.category||'').toLowerCase().includes('ongoing') ? fd >= new Date(eoc.date) : eoc.date === date;
    });
    matched.length > 0 ? res.json({ eocFound: true, events: matched }) : res.json({ eocFound: false });
  } catch (e) { next(e); }
};

// ---------------------------------------------------------------------------
// FLIGHT STATUS (Cirium) — unchanged
// ---------------------------------------------------------------------------
exports.checkFlightStatus = async (req, res, next) => {
  try {
    const { flightNumber, date, origin, destination } = req.query;
    if (!flightNumber || flightNumber === 'N/A') return res.json({ error: 'Valid flight number is required' });
    const cid = process.env.CIRIUM_APP_ID, ckey = process.env.CIRIUM_APP_KEY;
    if (!cid || !ckey) return res.json({ error: 'Cirium API Credentials Missing.' });

    const m = flightNumber.replace(/[^A-Za-z0-9]/g,'').match(/([A-Za-z]{3}|[A-Za-z0-9]{2})0*(\d{1,4})/);
    if (!m) return res.json({ error: `Invalid flight format (${flightNumber}).` });
    const carrier = m[1].toUpperCase(), fNum = m[2];

    let year, month, day;
    if (date && date !== 'Unknown') { [year,month,day] = date.split('-'); }
    else { const t = new Date(); year = t.getFullYear(); month = String(t.getMonth()+1).padStart(2,'0'); day = String(t.getDate()).padStart(2,'0'); }

    const resp = await fetch(`https://api.flightstats.com/flex/flightstatus/rest/v2/json/flight/status/${carrier}/${fNum}/dep/${year}/${month}/${day}?appId=${cid}&appKey=${ckey}&utc=false`, { headers: { Accept: 'application/json' } });
    const data = await resp.json();
    if (data.error) return res.json({ error: data.error.errorMessage || 'Cirium API Error' });
    if (!data.flightStatuses?.length) return res.json({ error: `No data for ${carrier}${fNum} on ${date}.` });

    let tgt = data.flightStatuses[0];
    const rds = `${year}-${month}-${day}`;
    const filt = (o,d) => data.flightStatuses.filter(f => (!o||o==='Unknown'||f.departureAirportFsCode===o.toUpperCase()) && (!d||d==='Unknown'||f.arrivalAirportFsCode===d.toUpperCase()) && f.departureDate?.dateLocal?.startsWith(rds));
    let ex = filt(origin,destination); if (!ex.length) ex = filt(null,destination); if (!ex.length) ex = data.flightStatuses.filter(f=>f.departureDate?.dateLocal?.startsWith(rds));
    let multiDisrupt = false;
    if (ex.length) { const sp={D:1,C:2,L:3,A:4,S:5,U:6}; ex.sort((a,b)=>(sp[a.status]||99)-(sp[b.status]||99)); tgt=ex[0]; const us=[...new Set(ex.map(f=>f.status))]; if(us.includes('D')&&us.includes('C')) multiDisrupt=true; }

    const fD=ds=>{if(!ds)return'--';const d=new Date(ds),M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return`${String(d.getDate()).padStart(2,'0')}-${M[d.getMonth()]}-${d.getFullYear()}`};
    const fT=ds=>{if(!ds)return'--:--';const d=new Date(ds);return`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`};
    const fO=(l,u)=>{if(!l||!u)return'Local';const d=Math.round((new Date(l)-new Date(u))/3600000);return d>=0?`UTC+${d}`:`UTC${d}`};
    const fDr=m=>{if(!m||isNaN(m))return'--h --m';return`${Math.floor(m/60)}h ${m%60}m`};

    const ops=tgt.operationalTimes||{},sDep=ops.scheduledGateDeparture||ops.scheduledRunwayDeparture||ops.publishedDeparture||{},aDep=ops.actualGateDeparture||ops.estimatedGateDeparture||ops.actualRunwayDeparture||sDep,sArr=ops.scheduledGateArrival||ops.scheduledRunwayArrival||ops.publishedArrival||{},aArr=ops.actualGateArrival||ops.estimatedGateArrival||ops.actualRunwayArrival||sArr;
    const depAL=(ops.actualGateDeparture||ops.actualRunwayDeparture)?'Actual':ops.estimatedGateDeparture?'Estimated':'Scheduled';
    const arrAL=(ops.actualGateArrival||ops.actualRunwayArrival)?'Actual':ops.estimatedGateArrival?'Estimated':'Scheduled';
    const dur=fDr(tgt.flightDurations?.scheduledBlockMinutes||0);
    const adm=tgt.delays?.arrivalGateDelayMinutes||tgt.delays?.arrivalRunwayDelayMinutes||0;
    let ads='On Time'; if(adm>0) ads=adm>=60?fDr(adm):`${adm} mins`;
    const rs=tgt.status||'U',atp=rs==='L'&&!ops.actualGateArrival&&!ops.actualRunwayArrival&&!ops.estimatedGateArrival,dc=rs==='D'?(tgt.divertedAirportFsCode||'???'):null;
    let bb,bt,ac;
    switch(rs){case'S':if(adm>0){bb='#f59e0b';bt=`SCHEDULED | Delayed ${ads}`;ac='#ef4444';}else{bb='#3b82f6';bt='SCHEDULED';ads='Scheduled';ac='#3b82f6';}break;case'A':if(adm>0){bb='#f59e0b';bt=`IN FLIGHT | Delayed ${ads}`;ac='#ef4444';}else{bb='#3b82f6';bt='IN FLIGHT';ac='#22c55e';}break;case'L':if(atp){bb='#f59e0b';bt='LANDED | FINAL ARRIVAL PENDING';ads='Pending / Unknown';ac='#f59e0b';}else if(adm>0){bb='#f59e0b';bt=`LANDED | ${ads} Late`;ac='#ef4444';}else{bb='#22c55e';bt='LANDED | On Time';ac='#22c55e';}break;case'C':bb='#ef4444';bt='FLIGHT CANCELLED';ads='CANCELLED';ac='#ef4444';break;case'D':if(multiDisrupt){bb='#991b1b';bt=`DIVERTED & CANCELLED → ${dc}`;ads='DIVERTED/CANCELLED';ac='#ef4444';}else{bb='#ef4444';bt=adm>0?`DIVERTED → ${dc} | Delayed ${ads}`:`DIVERTED → ${dc}`;ads='DIVERTED';ac='#ef4444';}break;default:bb='#64748b';bt='STATUS UNKNOWN';ads='Unknown';ac='#64748b';}

    let di=tgt.departureAirportFsCode||'N/A',ai=tgt.arrivalAirportFsCode||'N/A',dc_=di,ac_=ai,dn='',an='',dtc=null,oc=tgt.operatingCarrierFsCode||tgt.carrierFsCode||carrier,on_=oc;
    if(data.appendix?.airports){const p=data.appendix.airports.find(a=>a.fs===di);if(p){dc_=p.city||di;dn=p.name||'';}const q=data.appendix.airports.find(a=>a.fs===ai);if(q){ac_=q.city||ai;an=q.name||'';}if(dc){const r=data.appendix.airports.find(a=>a.fs===dc);if(r)dtc=r.city||dc;}}
    if(data.appendix?.airlines){const l=data.appendix.airlines.find(a=>a.fs===oc||a.iata===oc||a.icao===oc);if(l)on_=l.name||oc;}

    res.json({ aiStats:{ bannerBg:bb,bannerTextCol:'#ffffff',bannerText:bt,flightDuration:dur,operatorName:on_,rawStatus:rs,divertedTo:dc,divertedToCity:dtc,arrTimeDataPending:atp,depIata:di,depCity:dc_,depName:dn,depDate:fD(sDep.dateLocal),depSched:fT(sDep.dateLocal),depSchedZone:fO(sDep.dateLocal,sDep.dateUtc),depActual:fT(aDep.dateLocal),depActualZone:fO(aDep.dateLocal,aDep.dateUtc),depActualLabel:depAL,arrIata:ai,arrCity:ac_,arrName:an,arrDate:fD(sArr.dateLocal),arrSched:fT(sArr.dateLocal),arrSchedZone:fO(sArr.dateLocal,sArr.dateUtc),arrActual:fT(aArr.dateLocal),arrActualZone:fO(aArr.dateLocal,aArr.dateUtc),arrActualLabel:atp?'Data Pending':arrAL,arrDelay:ads,arrDelayColor:ac }, rawResponse:data });
  } catch(e){ console.error('🔥 Flight Status Crash:',e); return res.json({ error: e.message||'Unexpected error.' }); }
};