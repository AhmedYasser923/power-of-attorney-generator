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
// RESPONSE SCHEMA
// ---------------------------------------------------------------------------
const TICKET_RESPONSE_SCHEMA = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      passengers: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            firstName:    { type: SchemaType.STRING },
            lastName:     { type: SchemaType.STRING },
            ticketNumber: {
              type: SchemaType.STRING,
              description: 'STRICTLY 13 NUMERIC DIGITS. NO LETTERS. Output "Not Provided" if missing.',
            },
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
                  printedReference: {
                    type: SchemaType.STRING,
                    description: 'Raw alphanumeric reference physically printed on the document. Output "Not Provided" if absent.',
                  },
                  pnr: {
                    type: SchemaType.STRING,
                    description: 'True airline PNR. If multiple passengers have DIFFERENT PNRs on this exact leg, combine them like "PNR (Name) / PNR (Name)". Otherwise, just output the single PNR.',
                  },
                  // ─────────────────────────────────────────────────────────────
                  // flightStatus — THE MOST IMPORTANT FIELD. READ RULES CAREFULLY.
                  // ─────────────────────────────────────────────────────────────
                  flightStatus: {
                    type: SchemaType.STRING,
                    description: `CHOOSE EXACTLY ONE of these seven values based on the strict rules below.
DO NOT mix values or invent new ones.

VALUE DEFINITIONS (mutually exclusive — pick the first one that matches):

"Cancelled"
  → The AIRLINE unilaterally cancelled or did not operate this specific flight.
  → Evidence: explicit "CANCELLED" stamp, the flight number is absent from departure boards, airline sent a cancellation notice.
  → DO NOT use this if the flight operated normally but the passenger simply didn't board it.

"Unused / Missed Connection"
  → The flight DID operate (or was scheduled to operate) but the PASSENGER did not board it.
  → Causes: missed connection due to delay on a prior leg, passenger was rebooked onto a different flight, original routing was replaced BEFORE departure.
  → This is the correct value when the original direct flight is shown on the ticket alongside replacement flights — the original leg was NOT cancelled by the airline, it was abandoned because the itinerary changed.
  → KEY RULE: If you see an original routing (A→B) printed alongside a replacement routing (A→C→B), the A→B leg is "Unused / Missed Connection", NOT "Cancelled".

"Rescheduled"
  → The SAME flight number operated but at a materially different time than originally booked.
  → Evidence: two departure/arrival times printed for the same flight (original crossed out + new time), or an explicit "RESCHEDULED" / "TIME CHANGE" notation on the document.
  → Use this only when the same flight number ran, just at a different time.

"Replacement Flight"
  → This is a newly issued alternative flight that replaced a cancelled or disrupted original.
  → Both the disrupted original leg AND this replacement leg must be explicitly printed on the same document.
  → DO NOT use this just because REROUTE appears as a background endorsement on the ticket stock.

"Unused Replacement Flight"
  → A replacement flight that was issued but also not boarded by the passenger.

"Flown"
  → The passenger successfully boarded and completed this flight.

"Scheduled"
  → Default for a future or unverified flight with no disruption evidence.`,
                  },
                  marketingAirline:        { type: SchemaType.STRING },
                  marketingAirlineCountry: { type: SchemaType.STRING, description: 'Home country of the booked/marketing airline' },
                  operatingAirline:        { type: SchemaType.STRING },
                  operatingAirlineCountry: { type: SchemaType.STRING, description: 'Home country of the operating airline' },
                  flightNumbers: {
                    type: SchemaType.ARRAY,
                    items: { type: SchemaType.STRING },
                    description: 'All flight numbers for this leg. Remove ALL spaces and hyphens inside a single number (e.g. "6E 2" → "6E2"). Never split one number into two items.',
                  },
                  originIata:         { type: SchemaType.STRING },
                  originName:         { type: SchemaType.STRING },
                  originCity:         { type: SchemaType.STRING },
                  originCountry:      { type: SchemaType.STRING },
                  departureTime:      { type: SchemaType.STRING, description: 'Exact time printed. Output "--:--" if absent (do not use boarding time).' },
                  arrivalTime:        { type: SchemaType.STRING, description: 'Exact time printed. Output "--:--" if absent.' },
                  destinationIata:    { type: SchemaType.STRING },
                  destinationName:    { type: SchemaType.STRING },
                  destinationCity:    { type: SchemaType.STRING },
                  destinationCountry: { type: SchemaType.STRING },
                  rawExtractedDate:   { type: SchemaType.STRING, description: 'The exact raw date string printed for THIS leg. Never copy from another leg.' },
                  date: {
                    type: SchemaType.STRING,
                    description: 'YYYY-MM-DD if the year is explicitly printed. Otherwise output only the Day and Month seen (e.g. "25 Mar"). NEVER assume or append a year.',
                  },
                  // For Rescheduled legs: store the originally-booked times
                  originalDepartureTime: {
                    type: SchemaType.STRING,
                    description: 'ONLY for Rescheduled legs: the originally-booked departure time printed on the document (before the change). Output "--:--" for all other statuses.',
                  },
                  originalArrivalTime: {
                    type: SchemaType.STRING,
                    description: 'ONLY for Rescheduled legs: the originally-booked arrival time printed on the document (before the change). Output "--:--" for all other statuses.',
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
                          expirationDate:        { type: SchemaType.STRING, description: 'YYYY-MM-DD or N/A' },
                          isExpired:             { type: SchemaType.BOOLEAN },
                        },
                        required: [
                          'originYears','destinationYears','marketingAirlineYears',
                          'operatingAirlineYears','bestCountry','bestYears',
                          'expirationDate','isExpired',
                        ],
                      },
                    },
                    required: ['legOriginCountry','legDestinationCountry','status','reason','claimExpiration'],
                  },
                },
                required: [
                  'printedReference','pnr','flightStatus','marketingAirline',
                  'marketingAirlineCountry','operatingAirline','operatingAirlineCountry',
                  'flightNumbers','originIata','originName','originCity','originCountry',
                  'departureTime','arrivalTime','destinationIata','destinationName',
                  'destinationCity','destinationCountry','rawExtractedDate','date',
                  'originalDepartureTime','originalArrivalTime','ec261Leg',
                ],
              },
            },
          },
          required: ['type', 'legs'],
        },
      },
    },
    required: ['passengers', 'ec261', 'routes'],
  },
};

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

  if (files.length === 0) {
    return next(new AppError('No files uploaded', 400));
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

  let yearDirective = '';
  if (journeyYear) {
    yearDirective = `\n🚨 GLOBAL JOURNEY YEAR: ${journeyYear}. If a flight date only shows Day and Month (e.g. "25 Mar"), you MUST output it as "${journeyYear}-03-25".`;
  }

  const rawPrompt = `
    You are an expert aviation data extractor and legal evaluator. Analyze ALL the attached travel document(s). try not to exceed 40s in analyzing
    ${yearDirective}
    🚨 ***ANTI-LAZINESS & ZERO-HALLUCINATION DIRECTIVE*** 🚨
    You MUST extract EVERY SINGLE flight leg and EVERY SINGLE passenger found across ALL provided documents. Do NOT skip, summarize, or omit any flights.
    
    🧠 ***THE ANALYTICAL FRAMEWORK (CHAIN OF THOUGHT)*** 🧠
    Before generating the JSON, you must mentally process the documents using this exact sequence:
    1. Entity Grouping: Identify all unique passengers. If multiple passengers share the exact same flight numbers, dates, and routes, treat them as a single traveling party.
    2. Chronological Sequencing: Extract every single flight leg shown across all documents and arrange them strictly by Date and Departure Time to build a master timeline. FLIGHTS WITH THE SAME PNR SHOULD BE GROUPED TOGETHER IN IT'S OWN JOURNEY
    3. Anomaly Detection (Disruptions): Look for logical breaks or overlaps in the timeline. If a passenger has tickets for a direct flight (A ➔ B), AND tickets for a multi-leg flight reaching the same destination (A ➔ C ➔ B) within 48 hours, this is a Disruption/Rebooking. 
    4. Deductive Reasoning: Apply the EC261 legal rules to the entire chronologically sequenced journey, basing the jurisdiction solely on the very first origin point in the timeline.

    *CRITICAL DATE INFERENCE RULES (100% PRECISION REQUIRED)*: 
    1. AVOID ANCHORING VIA RAW EXTRACTION: In round-trip or multi-leg itineraries, EVERY flight has its own unique date. You MUST extract the exact raw date string printed specifically for EACH flight leg and place it in the "rawExtractedDate" field. Do NOT reuse dates.
    2. IGNORE ISSUE DATES: The "Issue Date", "Booking Date", or "Printed Date" is NEVER the flight date. Ignore it completely.
    3. NO YEAR ASSUMPTIONS: If the document only shows the day and month (e.g., "25 Mar"), DO NOT assume or append the current year. Output EXACTLY the explicit day and month you see. Only format as YYYY-MM-DD if the year is explicitly printed.
  

    🚨 JOURNEY SPLITTING ALGORITHM (FOLLOW EXACTLY IN ORDER) 🚨
    RULE 1 - THE "SELF-TRANSFER" SPLIT: Scan the document for the exact words "Self-transfer", "Self transfer", or "Separate tickets". 
    -> IF FOUND: You MUST break the itinerary at that exact layover. Because the airlines have no official connection, every flight separated by a self-transfer becomes an INDEPENDENT journey object.
    
    RULE 2 - STANDARD CONNECTIONS (DO NOT SPLIT): 
    -> IF flights are connected normally (e.g., standard layovers, codeshares) without the words "self-transfer", keep those flights grouped together in the SAME journey object. Do not split standard connecting flights.
    
    RULE 3 - STANDARD ROUND-TRIPS: 
    -> IF it is a round-trip ticket (A to B, then B to A at a later date), you must split it into exactly TWO journey objects (one Outbound, one Return).
    
    RULE 4 - PASSENGER GROUPING: Group passengers with the exact same flights into ONE journey object ALWAYS. If they share a flight but have different PNRs, you MUST combine them into a single string in the leg's PNR field like this: "PNR1 (Name) / PNR2 (Name)".
    
    🚨 RULE 5 — FLIGHT STATUS (CRITICAL — READ EVERY WORD) 🚨
    The flightStatus field has strict, mutually-exclusive definitions. The schema description explains each value. Here are the key disambiguation rules you MUST apply:

    CANCELLED vs UNUSED / MISSED CONNECTION:
    These two values are NOT interchangeable. Use this decision tree:
    A) Did the AIRLINE unilaterally cancel this specific flight number so it never operated? → "Cancelled"
    B) Did the flight exist/operate, but the passenger was rebooked, couldn't connect, or didn't board? → "Unused / Missed Connection"
    C) Is the original routing (A→B) printed on the same document as a replacement routing (A→C→B)? → The A→B leg is "Unused / Missed Connection" ALWAYS. It was NOT cancelled by the airline — the passenger was moved to an alternative.

    RESCHEDULED:
    Use "Rescheduled" ONLY when the SAME flight number shows evidence of a time change on the document: two departure times listed (original + new), or an explicit "RESCHEDULED" / "TIME CHANGE" / "NEW TIME" notation.
    When you detect a reschedule, populate originalDepartureTime and originalArrivalTime with the old times, and put the new times in departureTime and arrivalTime.

    REPLACEMENT FLIGHT:
    Use ONLY when both the disrupted original leg AND this new alternative leg are explicitly printed on the same document. Do NOT use just because "REROUTE" appears as a background endorsement on ticket stock.

    DEFAULT: If none of the above apply, use "Scheduled".

    STEP 1: EXTRACT PASSENGERS & TICKETS
    - Passengers & Tickets: Create an object for EACH passenger. Map their specific e-ticket number to their name. 🚨 TICKET RULE: E-tickets are strictly NUMERIC ONLY and exactly 13 digits globally. NEVER contain letters.
    - PER-LEG TICKETS (CRITICAL): If e-ticket numbers are listed row-by-row for specific flight legs (e.g., "TRV - BLR: Not required", "BLR - FRA: 2206906706612"), you MUST assign the 13-digit number that corresponds to the flights inside the current journey object you are building. If it says "Not required", output "Not Provided".

    PNR EXCEPTION LIST : 
    - MASSIVE OTA IDs: Never use massive strings labeled "Booking ID" or "Order ID" (e.g., "MN2Z5OQ0...") as the true airline PNR.
    - 🚨 OTA "E-TICKET" TRICK: Online Travel Agencies sometimes print a string containing letters under an "E-TICKET NO" or "Ticket Number" label (e.g., "LH220HABMTTA4"). This is NOT an e-ticket. It is masking the Airline PNR. Do NOT place strings with letters into the ticketNumber field.
    - EMBEDDED PNRS: If you see the PNR hidden inside a longer pseudo e-ticket string (e.g., in "LH220HABMTTA4"), extract ONLY the core 6 characters ("HABMTT").
    - don't extract true pnr out of a printed ref, ex "LXC6A4E3"

    STEP 2: EVALUATE OVERALL EC261 & UK261 ELIGIBILITY
    - EU: 27 member states, Iceland, Norway, Switzerland, Canary Islands, Madeira, Azores, Guadeloupe. (Ireland/DUB is EU).
    - UK: England, Scotland, Wales, Northern Ireland.
    
    🚨 CRITICAL EC261 ELIGIBILITY RULES (EVALUATE IN THIS EXACT ORDER):
    RULE 1: THE STRICT THIRD-COUNTRY TO THIRD-COUNTRY DOCTRINE (CASE C-451/20)
    If the overall journey starts outside the EU/UK AND the final destination is outside the EU/UK (e.g., USA to India), the ENTIRE journey is strictly NOT ELIGIBLE. You MUST mark the overall journey status AND EVERY SINGLE INDIVIDUAL LEG as "Not Eligible," regardless of where it connects or what airline operates it. Do not evaluate per-leg. 
    👉 CRITICAL: For the "reason" field, you MUST output exactly: "Not Covered: Both the origin and final destination are outside the EU/UK." Do not use the phrase "third country".
    RULE 2: THE EU ORIGIN DOCTRINE
    If the FIRST leg of the overall journey departs from an airport inside the EU/UK -> AUTOMATICALLY ELIGIBLE.
    
    RULE 3: ARRIVING IN THE EU/UK FROM OUTSIDE
    If the FIRST leg departs from OUTSIDE the EU/UK but the final destination is INSIDE the EU/UK -> Evaluate PER-LEG (Only legs arriving in the EU/UK operated by an EU/UK carrier are eligible).

    STEP 3: EXTRACT ROUTES & LEGS
    For each leg:
    - flightNumbers: ***CRITICAL*** Extract ALL flight numbers associated with this specific leg (e.g., marketing and operating flight numbers).
      🚨 RULE 1: A flight number is an airline code (2-3 characters) attached to digits (1-4 characters).
      🚨 RULE 2: You MUST remove all spaces and hyphens from inside a single flight number (e.g., "6E 2" or "6E - 2" becomes "6E2").
      🚨 RULE 3: DO NOT split a single flight number into multiple array items. "6E 2" is ONE flight number ("6E2"), NOT ["6E", "2"].
      Output this as an ARRAY OF STRINGS.
      
    🚨 CRITICAL PNR EXCEPTION LIST:
      The following airlines use strictly NUMERIC PNRs of varying lengths instead of 6-alphanumeric strings:
      - 6 Numbers: Heston Airlines, Sunclass.
      - 7 Numbers: Corendon DUTCH Airlines CD.
      - 8 Numbers: Air Arabia Maroc, Arkia Israel, TUI Airways, Condor Flugdienst, Electra Airways.
      - 9 Numbers: Fly Jinnah.
      - Variable/Numbers: Neos.
  `;

  const prompt = rawPrompt.replace(/\s+/g, ' ').trim();

  const documentParts = [];

  for (const file of files) {
    if (file.mimetype === 'application/pdf') {
      try {
        const data = await pdfExtract.extractBuffer(file.buffer);
        const text = data.pages
          .map(page => page.content.map(item => item.str).join(' '))
          .join('\n')
          .trim();

        if (text.length > 100) {
          console.log(`[PDF] Digital (${text.length} chars) → sending as text part.`);
          documentParts.push({ text: `[PDF text content]\n${text}` });
        } else {
          throw new Error(`Insufficient text extracted (${text.length} chars)`);
        }
      } catch (pdfErr) {
        console.log(`[PDF] Scanned (${pdfErr.message}) → sending as inlineData.`);
        documentParts.push({
          inlineData: { data: file.buffer.toString('base64'), mimeType: 'application/pdf' },
        });
      }
    } else if (file.mimetype.startsWith('image/')) {
      const processed = await sharp(file.buffer)
        .resize({ width: 1600, withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer();
      documentParts.push({ inlineData: { data: processed.toString('base64'), mimeType: 'image/jpeg' } });
    } else {
      documentParts.push({ inlineData: { data: file.buffer.toString('base64'), mimeType: file.mimetype } });
    }
  }

  const startTime  = Date.now();
  let result;
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`⏳ Sending request to Gemini API... (Attempt ${attempt + 1})`);
      result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }, ...documentParts] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema:   TICKET_RESPONSE_SCHEMA,
        },
      });
      console.log('✅ Received response from Gemini.');
      break;
    } catch (apiError) {
      if (attempt === maxRetries) {
        console.error('🔥 GEMINI API CRASHED (All retries failed):', apiError);
        return next(new AppError(`AI Processing Failed after 3 attempts: ${apiError.message}`, 500));
      }
      const waitTime = (attempt + 1) * 2000;
      console.warn(`[Gemini API] ${apiError.message} — retrying in ${waitTime / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  const processingTimeInSeconds = ((Date.now() - startTime) / 1000).toFixed(2);

  let requestCostUSD = 0, requestCostEGP = 0;
  if (result.response.usageMetadata) {
    const { promptTokenCount: i = 0, candidatesTokenCount: o = 0 } = result.response.usageMetadata;
    requestCostUSD = (i / 1_000_000) * 0.075 + (o / 1_000_000) * 0.30;
    requestCostEGP = requestCostUSD * 54.33;
    console.log(`\n========================================= TICKET ANALYZED IN ${processingTimeInSeconds}s`);
    console.log(`📥 ${i.toLocaleString()} in / 📤 ${o.toLocaleString()} out | 💸 $${requestCostUSD.toFixed(6)} / £${requestCostEGP.toFixed(6)} EGP\n`);
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

  parsedJourneys.forEach(journey => {
    if (!journey.routes) return;
    journey.routes.forEach(route => {
      if (!route.legs) return;
      route.legs.forEach(leg => {

        if (Array.isArray(leg.flightNumbers)) {
          const cleaned = leg.flightNumbers.map(fn => fn.replace(/[\s-]/g, '').trim()).filter(Boolean);
          const merged  = [];
          for (let i = 0; i < cleaned.length; i++) {
            if (i < cleaned.length - 1 && /^[A-Za-z0-9]{2,3}$/.test(cleaned[i]) && /^\d{1,4}$/.test(cleaned[i + 1])) {
              merged.push(cleaned[i] + cleaned[i + 1]); i++;
            } else { merged.push(cleaned[i]); }
          }
          leg.flightNumbers = merged;
        }

        const oIata      = (leg.originIata      || '').toUpperCase();
        const dIata      = (leg.destinationIata || '').toUpperCase();
        const originPort = airportsDatabase.find(a => a.iata && a.iata.toUpperCase() === oIata);
        const destPort   = airportsDatabase.find(a => a.iata && a.iata.toUpperCase() === dIata);
        leg.ec261Leg     = leg.ec261Leg || {};

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
        const dispOp = leg.operatingAirlineCountry && leg.operatingAirlineCountry !== 'Unknown' ? leg.operatingAirlineCountry : 'Unknown HQ';
        const dispMkt = leg.marketingAirlineCountry && leg.marketingAirlineCountry !== 'Unknown' ? leg.marketingAirlineCountry : 'Unknown HQ';

        leg.claimDocuments = marketing === operating
          ? [{ airline: marketing, role: '',         reqs: getAirlineReqs(marketing), hq: dispOp,  limit: opLimRaw  !== 'N/A' ? `${opLimRaw} years`  : 'N/A' }]
          : [
              { airline: marketing, role: 'Booked',   reqs: getAirlineReqs(marketing), hq: dispMkt, limit: mktLimRaw !== 'N/A' ? `${mktLimRaw} years` : 'N/A' },
              { airline: operating, role: 'Operated', reqs: getAirlineReqs(operating), hq: dispOp,  limit: opLimRaw  !== 'N/A' ? `${opLimRaw} years`  : 'N/A' },
            ];

        if (leg.ec261Leg?.claimExpiration) {
          const oL = getJurisdictionLimit((leg.originCountry||'').toLowerCase().trim());
          const dL = getJurisdictionLimit((leg.destinationCountry||'').toLowerCase().trim());
          leg.ec261Leg.claimExpiration.originYears           = oL;
          leg.ec261Leg.claimExpiration.destinationYears      = dL;
          leg.ec261Leg.claimExpiration.operatingAirlineYears = opLimRaw;
          leg.ec261Leg.claimExpiration.marketingAirlineYears = mktLimRaw;

          let best = 0, bestName = 'Unknown';
          for (const { limit, name } of [{ limit: oL, name: leg.originCountry }, { limit: dL, name: leg.destinationCountry }, { limit: opLimRaw, name: leg.operatingAirlineCountry }, { limit: mktLimRaw, name: leg.marketingAirlineCountry }]) {
            const n = typeof limit === 'number' ? limit : null;
            if (n !== null && n > best) { best = n; bestName = name; }
          }

          if (best > 0 && leg.date && leg.date !== 'Unknown') {
            leg.ec261Leg.claimExpiration.bestYears   = best;
            leg.ec261Leg.claimExpiration.bestCountry = bestName;
            const fd = new Date(leg.date);
            if (!isNaN(fd.getTime())) { fd.setFullYear(fd.getFullYear() + best); leg.ec261Leg.claimExpiration.expirationDate = fd.toISOString().split('T')[0]; leg.ec261Leg.claimExpiration.isExpired = new Date() > fd; }
          } else {
            leg.ec261Leg.claimExpiration.bestYears = 'N/A'; leg.ec261Leg.claimExpiration.bestCountry = 'N/A';
            leg.ec261Leg.claimExpiration.expirationDate = 'N/A'; leg.ec261Leg.claimExpiration.isExpired = false;
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
// FLIGHT STATUS (Cirium)
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