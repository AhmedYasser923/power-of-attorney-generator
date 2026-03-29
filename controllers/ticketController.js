const { GoogleGenerativeAI } = require('@google/generative-ai');
const sharp = require('sharp');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// --- LOAD EOC DATABASE DIRECTLY FROM JSON ---
const eocDatabase = require('../eoc_data.json');
console.log(`[EOC Database] Successfully loaded ${eocDatabase.length} records from JSON.`);

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- THE AIRLINE DOCUMENT DATABASE ---
const airlineRequirements = [
  { names: ["aeroitalia"], reqs: "ID" },
  { names: ["aerolineas argentinas", "ar"], reqs: "Ticket number, ID number" },
  { names: ["air algerie"], reqs: "ID (Front and Back) or Copy of Passport" },
  { names: ["air arabia"], reqs: "Ticket number, Boarding pass, ID (If delayed: need rescheduled time)" },
  { names: ["air cairo", "msc"], reqs: "Boarding pass, ID" },
  { names: ["air canada", "ac"], reqs: "Ticket number" },
  { names: ["air corsica", "corse-mediterranee", "xk"], reqs: "Boarding pass, ID" },
  { names: ["air dolomiti", "en"], reqs: "Ticket number" },
  { names: ["air europa", "ux"], reqs: "POA, ID, Boarding pass" },
  { names: ["asl airlines france"], reqs: "Boarding pass, ID" }, 
  { names: ["air france", "af"], reqs: "ID" },
  { names: ["air india", "ai"], reqs: "Ticket number, Passport (Both strictly mandatory)" },
  { names: ["air mauritius", "mk"], reqs: "Ticket number, DOB" },
  { names: ["air serbia", "ju"], reqs: "Ticket number, Boarding pass (Boarding pass only if delayed)" },
  { names: ["air tahiti nui"], reqs: "DOB" },
  { names: ["bintercanarias", "binter canarias"], reqs: "Passport" },
  { names: ["canaryfly"], reqs: "ID / Passport number" },
  { names: ["corendon dutch"], reqs: "Ticket, Boarding pass, Reservation confirmation" }, 
  { names: ["corendon", "xc"], reqs: "DOB" },
  { names: ["corsair", "ss"], reqs: "Ticket number, DOB" },
  { names: ["danish air transport", "dx"], reqs: "Boarding pass, ID" },
  { names: ["dan air", "dan-air"], reqs: "Boarding pass, ID" },
  { names: ["delta", "dl"], reqs: "Ticket number, ID" },
  { names: ["egyptair", "ms"], reqs: "Ticket number, ID" },
  { names: ["el al", "ly"], reqs: "ID" },
  { names: ["emirates", "ek"], reqs: "Ticket number, Passport" },
  { names: ["enter air"], reqs: "Birth certificate required for minors" },
  { names: ["ethiopian", "et"], reqs: "Ticket number, ID" },
  { names: ["etihad", "ey"], reqs: "Ticket number" },
  { names: ["iberia", "ib"], reqs: "Ticket number, Passport / National ID / Spanish Residence card" },
  { names: ["iberojet"], reqs: "Submit via portal: iberojet.com/es/solicitudes/reclamaciones" },
  { names: ["indigo"], reqs: "DOB" },
  { names: ["ita airways", "ita"], reqs: "Ticket number" },
  { names: ["alitalia"], reqs: "Ticket number" },
  { names: ["kenya airways", "kq"], reqs: "Ticket number" },
  { names: ["klm", "kl"], reqs: "ID" },
  { names: ["lan airlines", "latam", "la"], reqs: "ID / Passport" },
  { names: ["lufthansa", "lh"], reqs: "Lufthansa POA (Ticket & Boarding pass needed later)" },
  { names: ["neos air", "neos"], reqs: "Birth details/place, Passport no. (Codice Fiscale for Italian citizens)" },
  { names: ["oman air", "wy"], reqs: "Ticket number" },
  { names: ["plus ultra"], reqs: "Boarding pass, ID" },
  { names: ["polish airlines", "lot", "lo"], reqs: "Handwritten signature on POA" },
  { names: ["royal air maroc", "at"], reqs: "Ticket number" },
  { names: ["saudi", "saudia", "sv"], reqs: "Ticket number, Passport / ID" },
  { names: ["skyup", "u5"], reqs: "Boarding pass, Passport" },
  { names: ["sunexpress", "xq"], reqs: "ID" },
  { names: ["swiss", "lx"], reqs: "Ticket, Confirmation email copy" },
  { names: ["tarom", "ro"], reqs: "Ticket number (No PDFs accepted)" },
  { names: ["tui", "tom", "by"], reqs: "DOB, Mobile number" },
  { names: ["tunis air", "tunisair", "tu"], reqs: "Ticket number" },
  { names: ["turkish", "tk"], reqs: "ID" },
  { names: ["virgin atlantic", "vs"], reqs: "DOB" },
  { names: ["vistara"], reqs: "Merged with Air India. Send claim to Air India." },
  { names: ["volotea"], reqs: "Boarding pass, ID" },
  { names: ["vueling", "vy"], reqs: "ID" },
  { names: ["wizz", "wizzair"], reqs: "Wizz Air Denied Boarding Compensation Form" },
  { names: ["world2fly"], reqs: "ID / Passport number mandatory" }
];

exports.renderAnalyzer = catchAsync(async (req, res, next) => {
  res.render('ticket-analyzer', { title: 'Ticket Analyzer' });
});

exports.analyzeTicket = catchAsync(async (req, res, next) => {
  const files = req.files && req.files.length > 0 ? req.files : [];

  if (files.length === 0) {
    return next(new AppError('No files uploaded', 400));
  }

  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
  const currentYear = new Date().getFullYear();
  const currentDateFull = new Date().toISOString().split('T')[0];

  const prompt = `
    You are an expert aviation data extractor and legal evaluator. Analyze ALL the attached travel document(s). 
    
    🚨 ***ANTI-LAZINESS DIRECTIVE*** 🚨
    You MUST extract EVERY SINGLE flight leg and EVERY SINGLE passenger found across ALL provided documents. Do NOT skip, summarize, or omit any flights. If there are 4 boarding passes or a ticket with 4 legs, you MUST output data for all 4 legs. Scrutinize every page.
    
    *CRITICAL DATE INFERENCE RULE*: The current year is ${currentYear}. Many boarding passes only display the day and month (e.g., "15 Jan"). If the year is missing from the document, you MUST assume the year is ${currentYear} and append it to the date string. If the timeline suggests a flight from late last year, you may use ${currentYear - 1}.
    
    *CRITICAL ROUND-TRIP LAW*: Under EC261/UK261 law, a round-trip ticket (e.g., Outbound: EU to Asia, Return: Asia to EU) is legally treated as TWO separate journeys, even if booked under the exact same PNR. 
    - If the document is a ONE-WAY trip, create a SINGLE journey object.
    - If the document is a ROUND-TRIP, you MUST split it into TWO separate journey objects in the array: one object for the Outbound route, and a completely separate object for the Return route. 
    - If multiple documents share the same PNR and are part of the SAME directional trip, combine them. Combine multiple passenger names.

    YOU MUST OUTPUT AN ARRAY OF JOURNEY OBJECTS.

    Follow these STRICT instructions step-by-step for EACH journey object:

    STEP 1: EXTRACT BASIC INFO
    - Passenger Name: (Combine names if multiple passengers share this exact journey/PNR).
    - PNR / Booking Code: MUST be 5 to 9 alphanumeric characters. IGNORE 13-digit e-ticket numbers here. If missing, output "Not Provided".
    - Ticket Number: Extract the 13 or 14-digit e-ticket number if present. If multiple, separate by commas. If missing, output "Not Provided".
    - pnrNote: IF the "PNR" is "Not Provided" AND the marketing airline is in the special list below, output exactly: "💡 Note: For this airline, the 13-digit Ticket Number can be used in place of the PNR." Otherwise, leave empty ("").
      [SPECIAL AIRLINE LIST: Aero Contractors, Aeromexico, Air Albania, Air Cairo, Air China, Air Corsica, Air India, Air Mediterranean, Air Namibia, Air Nippon, Air Peace, Air Saint-Pierre, Air Senegal, Air Transat, Air Wisconsin, Akasa Air, American Airlines, Anima Wings, Arkia Israeli, Atlantic Airways, Austrian Airlines, Avianca, Azerbaijan Airlines, Azul, Bluebird Airways, BoA Boliviana, Corendon, Egyptair, Emerald Airlines, Emirates, Estelar, Ethiopian Airlines, Euroairlines, Fly Lili, Flyegypt, Flynas, GOL, GP Aviation, Hainan Airlines, Hifly, Icelandair, Kuwait Airways, La Compagnie, Lauda Europe, Nesma Airlines, Nile Air, Nouvelair, Oman Air, Pakistan International, Pegasus, Plus Ultra, Royal Air Maroc, Sky Vision, Skywest, T'way Air, TAP Air Portugal, Tarom, Tassili Airlines, Thai Airways, Tianjin Airlines, TUI, Tunisair, Turkish Airlines, Vietnam Airlines]

    STEP 2: EVALUATE OVERALL EC261 & UK261 ELIGIBILITY
    Treat this SPECIFIC directional journey (first origin of this route to final destination of this route) as a single unit.
    *CRITICAL LAW*: EC261/UK261 liability falls strictly on the OPERATING carrier, NOT the marketing carrier.
    
    *Definitions:*
    - EU: 27 member states, Iceland, Norway, Switzerland, Canary Islands, Madeira, Azores, Guadeloupe. (Ireland/DUB is EU).
    - UK: England, Scotland, Wales, Northern Ireland.
    - NON-EU/NON-UK: USA, China, Qatar, Turkey, UAE, Canada, India, Thailand, etc.
    - EU/UK Carrier (Operating): Lufthansa, Air France, KLM, Iberia, Wizz Air, Aer Lingus, British Airways, Virgin Atlantic, easyJet UK, etc.
    
    *Overall Evaluation Rules (Evaluate in order based on OPERATING airline of the legs):*
    1. Starts in EU or UK -> OVERALL JOURNEY IS ALWAYS ELIGIBLE. (Airline and final destination do not matter).
    2. Starts NON-EU/UK -> Ends NON-EU/UK -> OVERALL JOURNEY IS ALWAYS NOT ELIGIBLE. 
    3. Starts NON-EU/UK -> Ends in EU or UK -> Eligible ONLY IF OPERATING airline is an EU Carrier or a UK Carrier. (If non-EU/non-UK carrier, it is Not Eligible).

    STEP 3: EXTRACT ROUTES & LEGS
    Assign this route's type (e.g., "Outbound" or "Return").
    For each leg, carefully extract operating vs booked (marketing) details.
    - marketingAirline: Who the ticket was bought from.
    - operatingAirline: Who actually flies the plane (e.g., "Operated by..."). If not stated, assume it's the marketing airline.
    - operatingAirlineCountry: The home country of the OPERATING airline.
    - flightNumber: Include both if codeshare (e.g., "BA123 / AA456").
    
    *CRITICAL TIMELINE & REBOOKING LOGIC*: Do NOT blindly assume an earlier flight date is the "cancelled" one (passengers are sometimes rebooked to earlier flights). If you detect overlapping or conflicting flights for the exact same route across different documents, INCLUDE ALL LEGS. 
    - Set the "flightStatus" to "Scheduled" for standard flights.
    - If a flight document explicitly states it was cancelled, set it to "Cancelled".
    - If there are conflicting dates/times for the same route and it is unclear which was actually flown, set the "flightStatus" to "Schedule Change / Review".
    
    *CRITICAL LEG-BY-LEG EVALUATION RULES:*
    - IF this overall directional journey is "Eligible": EVERY SINGLE LEG in it is automatically "Eligible".
    - IF this overall directional journey is "Not Eligible": EVERY SINGLE LEG is automatically "Not Eligible", UNLESS a specific connecting leg DEPARTS from an EU/UK airport.
    
    *STATUTE OF LIMITATIONS (EXPIRATION) RULE*:
    Today's date is ${currentDateFull}. You MUST legally calculate if the claim is expired.
    Limitations by Country (ONLY Valid EU/EEA/UK Jurisdictions Apply):
    - 1 year: Poland
    - 2 years: Italy, Netherlands, Switzerland, Slovakia, Malta, Iceland
    - 3 years: Romania, Austria, Germany (Expires Dec 31st of the 3rd year), Portugal, Denmark, Finland, Norway, Czech Republic, Slovenia, Estonia
    - 5 years: France, Spain, Belgium, Bulgaria, Greece, Hungary, Croatia
    - 6 years: United Kingdom, Ireland, Cyprus
    - 10 years: Latvia, Lithuania, Luxembourg, Sweden
    
    Expiration Logic:
    1. Identify the limitation years for: (A) Origin Country, (B) Destination Country, (C) Operating Airline's Country. 
    2. *CRITICAL JURISDICTION CHECK*: You MUST discard any country that is NOT in the EU, UK, or EEA (Iceland, Norway, Switzerland). For example, if the destination is Canada, USA, or the airline is Emirates (UAE) or Turkish Airlines (Turkey), you CANNOT use their laws to file an EC261 claim. Their limitation period must be entirely ignored.
    3. Find the BEST (longest) limitation period among the remaining *eligible* EU/UK/EEA jurisdictions. Output the years (e.g., "3 years").
    4. Calculate the Deadline Date. (If Germany is chosen for the best period, deadline is Dec 31 of FlightYear + 3). Otherwise, Flight Date + Longest Limitation Period.
    5. Compare Deadline Date to ${currentDateFull}. If Deadline has passed, isExpired is true.

    *LEG DISTANCE & CLAIM VALUE CALCULATION*:
    For EACH leg, estimate the Great Circle Distance between its origin and destination airports and output it in "distanceKm" (e.g., "3450 km").
    ONLY IF the leg is Eligible AND isExpired is false, calculate the claim value based on that distance:
    - Distance up to 1,500 km: Output "€250"
    - Distance between 1,500 km and 3,500 km: Output "€400"
    - Distance over 3,500 km: Output "€600"
    If the leg is Not Eligible OR is Expired, output "N/A" for estimatedClaimValue.

    STEP 4: OUTPUT FORMAT
    *** IMPORTANT *** If the uploaded document does NOT contain any flight or travel information (e.g. it is a photo, receipt, ID, random text, or any non-travel document), return ONLY an empty JSON array: []
    Otherwise, return EXACTLY this JSON structure (an ARRAY of objects) and absolutely nothing else. Do not use markdown like \`\`\`json.
    
    [
      {
        "passengerName": "",
        "pnr": "",
        "ticketNumber": "",
        "pnrNote": "",
        "ec261": {
          "firstOriginCountry": "Actual starting country of this specific route (Label: EU, UK, or NON-EU)",
          "finalDestinationCountry": "Actual final destination country of this specific route (Label: EU, UK, or NON-EU)",
          "status": "Eligible or Not Eligible",
          "reason": "Brief reason based on rules."
        },
        "routes": [
          {
            "type": "Outbound or Return",
            "legs": [
              {
                "flightStatus": "Scheduled or Cancelled/Rebooked",
                "marketingAirline": "",
                "operatingAirline": "",
                "operatingAirlineCountry": "",
                "flightNumber": "",
                "originIata": "",
                "originName": "",
                "originCity": "",
                "originCountry": "",
                "departureTime": "",
                "destinationIata": "",
                "destinationName": "",
                "destinationCity": "",
                "destinationCountry": "",
                "arrivalTime": "",
                "date": "Format as YYYY-MM-DD",
                "distanceKm": "e.g., 3450 km",
                "ec261Leg": {
                  "legOriginCountry": "Leg starting country (Label: EU, UK, or NON-EU)",
                  "legDestinationCountry": "Leg destination country (Label: EU, UK, or NON-EU)",
                  "status": "Eligible or Not Eligible",
                  "reason": "Explain based on rules.",
                  "estimatedClaimValue": "€250, €400, €600, or N/A",
                  "claimExpiration": {
                    "originYears": "e.g. 3 years (If Non-EU, leave empty)",
                    "destinationYears": "e.g. 5 years (If Non-EU, leave empty)",
                    "airlineYears": "e.g. 2 years (If Non-EU, leave empty)",
                    "bestCountry": "Country Name",
                    "bestYears": "Number",
                    "expirationDate": "YYYY-MM-DD",
                    "isExpired": false
                  }
                }
              }
            ]
          }
        ]
      }
    ]
  `;

  const documentParts = [];
  for (const file of files) {
    let processedBuffer = file.buffer;
    let mimeType = file.mimetype;

    if (file.mimetype.startsWith('image/')) {
      processedBuffer = await sharp(file.buffer)
        .resize({ width: 1600, withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer();
      mimeType = 'image/jpeg';
    }

    documentParts.push({
      inlineData: { data: processedBuffer.toString("base64"), mimeType: mimeType }
    });
  }

  const startTime = Date.now();

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }, ...documentParts] }],
    generationConfig: {
      responseMimeType: "application/json"
    }
  });

  const endTime = Date.now();
  const processingTimeInSeconds = ((endTime - startTime) / 1000).toFixed(2);

  const responseText = result.response.text();

  let parsedJourneys;
  try {
    parsedJourneys = JSON.parse(responseText);
  } catch (parseErr) {
    return next(new AppError('The AI returned an unparseable response. Please try again.', 502));
  }

  // AI returned empty array → document had no flight information
  if (!Array.isArray(parsedJourneys) || parsedJourneys.length === 0) {
    return res.json({
      noFlightData: true,
      processingTime: processingTimeInSeconds,
      journeys: []
    });
  }

  parsedJourneys.forEach(journey => {
    if (journey.routes) {
      journey.routes.forEach(route => {
        if (route.legs) {
          route.legs.forEach(leg => {
            let opAirline = leg.operatingAirline || leg.marketingAirline || "";
            let reqsFound = "No documents required";

            if (opAirline) {
              const normalized = opAirline.toLowerCase();
              for (const item of airlineRequirements) {
                if (item.names.some(keyword => new RegExp(`\\b${keyword}\\b`, 'i').test(normalized))) {
                  reqsFound = item.reqs;
                  break;
                }
              }
            }
            leg.claimDocuments = reqsFound;
          });
        }
      });
    }
  });

  res.json({
    processingTime: processingTimeInSeconds,
    journeys: parsedJourneys
  });
});


// --- EOC JSON DATABASE CHECKER ---
exports.checkEOC = (req, res, next) => {
  try {
    const { date, originIata, destIata, originCountry, destCountry } = req.query;

    if (!date || date === 'Unknown') {
      return res.json({ eocFound: false });
    }

    const oIata = (originIata || '').toLowerCase();
    const dIata = (destIata || '').toLowerCase();
    const oCountry = (originCountry || '').toLowerCase();
    const dCountry = (destCountry || '').toLowerCase();
    const flightDate = new Date(date);

    const matchedEvents = eocDatabase.filter(eoc => {
      const eocLoc = (eoc.location || '').toLowerCase();

      const locationMatch = (eocLoc === oIata || eocLoc === dIata || eocLoc === oCountry || eocLoc === dCountry || eocLoc === "world wide");

      if (!locationMatch) return false;

      const eocCat = (eoc.category || '').toLowerCase();
      if (eocCat.includes('ongoing')) {
        const eocDate = new Date(eoc.date);
        return flightDate >= eocDate;
      } else {
        return eoc.date === date;
      }
    });

    if (matchedEvents.length > 0) {
      res.json({ eocFound: true, events: matchedEvents });
    } else {
      res.json({ eocFound: false });
    }
  } catch (error) {
    next(error);
  }
};


// --- INSTANT CIRIUM FLIGHT STATUS EXTRACTOR (AI-FREE) ---
exports.checkFlightStatus = catchAsync(async (req, res, next) => {
  const { flightNumber, date, destination } = req.query;

  if (!flightNumber || flightNumber === 'N/A') {
    return next(new AppError('Valid flight number is required', 400));
  }

  const ciriumAppId = process.env.CIRIUM_APP_ID;
  const ciriumAppKey = process.env.CIRIUM_APP_KEY;

  if (!ciriumAppId || !ciriumAppKey) {
    console.error("[Cirium] Error: CIRIUM_APP_ID or CIRIUM_APP_KEY Missing in config.env!");
    return res.json({ error: 'Cirium API Credentials Missing. Check .env file.' });
  }

  // 1. BULLETPROOF CHERRY-PICKING PARSER
  const match = flightNumber.match(/([A-Za-z]{3}|[A-Za-z0-9]{2})\s*0*(\d{1,4})/);
  if (!match) {
    return res.json({ error: `Invalid flight format (${flightNumber}). Expected format like 'LH458', 'VS207', or 'U28412'.` });
  }
  const carrier = match[1].toUpperCase();
  const fNum = match[2];

  // 2. Parse Date
  let year, month, day;
  if (date && date !== 'Unknown') {
    const parts = date.split('-');
    year = parts[0]; month = parts[1]; day = parts[2];
  } else {
    const today = new Date();
    year = today.getFullYear();
    month = String(today.getMonth() + 1).padStart(2, '0');
    day = String(today.getDate()).padStart(2, '0');
  }

  // 3. Fetch from Cirium
  const url = `https://api.flightstats.com/flex/flightstatus/rest/v2/json/flight/status/${carrier}/${fNum}/dep/${year}/${month}/${day}?appId=${ciriumAppId}&appKey=${ciriumAppKey}&utc=false`;
  const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
  const data = await response.json();

  if (data.error) {
    return res.json({ error: data.error.errorMessage || 'Cirium API Error' });
  }
  if (!data.flightStatuses || data.flightStatuses.length === 0) {
    return res.json({ error: `No flight data found in Cirium for ${carrier}${fNum} on ${date}.` });
  }

  // 4. Extract Target Flight Data (Find best match based on destination)
  let targetFlight = data.flightStatuses[0];
  if (destination && destination !== 'Unknown') {
    const destMatch = data.flightStatuses.find(f => f.arrivalAirportFsCode === destination.toUpperCase());
    if (destMatch) targetFlight = destMatch;
  }

  // Helpers
  const formatDate = (dateString) => {
    if (!dateString) return '--';
    const d = new Date(dateString);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
  };

  const formatTime = (dateString) => {
    if (!dateString) return '--:--';
    const d = new Date(dateString);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const calculateUtcOffset = (localStr, utcStr) => {
    if (!localStr || !utcStr) return "Local";
    const local = new Date(localStr);
    const utc = new Date(utcStr);
    const diffHours = Math.round((local - utc) / 3600000);
    return diffHours >= 0 ? `UTC+${diffHours}` : `UTC${diffHours}`;
  };

  const formatDuration = (mins) => {
    if (!mins || isNaN(mins)) return '--h --m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  // Operational Times
  const ops = targetFlight.operationalTimes || {};
  const sDep = ops.scheduledGateDeparture || ops.scheduledRunwayDeparture || {};
  const aDep = ops.actualGateDeparture || ops.estimatedGateDeparture || ops.actualRunwayDeparture || sDep;
  const sArr = ops.scheduledGateArrival || ops.scheduledRunwayArrival || {};
  const aArr = ops.actualGateArrival || ops.estimatedGateArrival || ops.actualRunwayArrival || sArr;

  const depActualLabel = (ops.actualGateDeparture || ops.actualRunwayDeparture) ? "Actual" : (ops.estimatedGateDeparture ? "Estimated" : "Scheduled");
  const arrActualLabel = (ops.actualGateArrival || ops.actualRunwayArrival) ? "Actual" : (ops.estimatedGateArrival ? "Estimated" : "Scheduled");

  // Flight Duration & Delay
  const flightDuration = formatDuration(targetFlight.flightDurations?.scheduledBlockMinutes || 0);
  const arrDelayMins = targetFlight.delays?.arrivalGateDelayMinutes || 0;

  let arrDelayStr = "On Time";
  if (arrDelayMins > 0) {
    arrDelayStr = arrDelayMins >= 60 ? formatDuration(arrDelayMins) : `${arrDelayMins} mins`;
  }

  // 5. Raw status + landed-but-no-arrival flag
  const rawStatus = targetFlight.status || 'U';
  const arrTimeDataPending = rawStatus === 'L' &&
    !ops.actualGateArrival && !ops.actualRunwayArrival && !ops.estimatedGateArrival;

  // 6. Status → Banner (all 6 Cirium codes)
  const statusMap = { 'S': 'Scheduled', 'A': 'Active', 'L': 'Landed', 'C': 'Cancelled', 'D': 'Diverted', 'U': 'Unknown' };
  const statusText = statusMap[rawStatus] || 'Unknown';
  const bannerTextCol = '#ffffff';
  let bannerBg, bannerText, arrDelayColor;
  const divertedCode = rawStatus === 'D' ? (targetFlight.divertedAirportFsCode || '???') : null;

  switch (rawStatus) {
    case 'S':
      bannerBg = '#3b82f6'; bannerText = 'SCHEDULED';
      arrDelayStr = 'Scheduled'; arrDelayColor = '#3b82f6';
      break;
    case 'A':
      if (arrDelayMins > 0) {
        bannerBg = '#f59e0b'; bannerText = `IN FLIGHT | Delayed ${arrDelayStr}`; arrDelayColor = '#ef4444';
      } else {
        bannerBg = '#3b82f6'; bannerText = 'IN FLIGHT'; arrDelayColor = '#22c55e';
      }
      break;
    case 'L':
      if (arrDelayMins > 0) {
        bannerBg = '#f59e0b'; bannerText = `LANDED | ${arrDelayStr} Late`; arrDelayColor = '#ef4444';
      } else {
        bannerBg = '#22c55e'; bannerText = 'LANDED | On Time'; arrDelayColor = '#22c55e';
      }
      break;
    case 'C':
      bannerBg = '#ef4444'; bannerText = 'FLIGHT CANCELLED';
      arrDelayStr = 'CANCELLED'; arrDelayColor = '#ef4444';
      break;
    case 'D':
      bannerBg = '#ef4444'; bannerText = `DIVERTED → ${divertedCode}`;
      arrDelayStr = 'DIVERTED'; arrDelayColor = '#ef4444';
      break;
    default: // 'U'
      bannerBg = '#64748b'; bannerText = 'STATUS UNKNOWN';
      arrDelayStr = 'Unknown'; arrDelayColor = '#64748b';
  }

  // 7. Appendix lookups (airports + operator + diverted airport)
  let depIata = targetFlight.departureAirportFsCode || 'N/A';
  let arrIata = targetFlight.arrivalAirportFsCode || 'N/A';
  let depCity = depIata, arrCity = arrIata, depName = '', arrName = '';
  let divertedToCity = null;
  let operatorCode = targetFlight.operatingCarrierFsCode || targetFlight.carrierFsCode || carrier;
  let operatorName = operatorCode;

  if (data.appendix && data.appendix.airports) {
    const dPort = data.appendix.airports.find(a => a.fs === depIata);
    if (dPort) { depCity = dPort.city || depIata; depName = dPort.name || ''; }
    const aPort = data.appendix.airports.find(a => a.fs === arrIata);
    if (aPort) { arrCity = aPort.city || arrIata; arrName = aPort.name || ''; }
    if (divertedCode) {
      const dvPort = data.appendix.airports.find(a => a.fs === divertedCode);
      if (dvPort) divertedToCity = dvPort.city || divertedCode;
    }
  }

  if (data.appendix && data.appendix.airlines) {
    const opLine = data.appendix.airlines.find(a => a.fs === operatorCode || a.iata === operatorCode || a.icao === operatorCode);
    if (opLine) operatorName = opLine.name || operatorCode;
  }

  // 8. Gemini AI comment — only for notable situations (cancel / divert / unknown / delay ≥ 30 min)
  let aiComment = null;
  if (['C', 'D', 'U'].includes(rawStatus) || arrDelayMins >= 30) {
    try {
      const commentModel = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });
      const commentPrompt = `Flight data: status=${statusText}, dep scheduled=${formatTime(sDep.dateLocal)} actual=${formatTime(aDep.dateLocal)}, arr scheduled=${formatTime(sArr.dateLocal)} actual=${formatTime(aArr.dateLocal)}, delay=${arrDelayMins} mins${divertedCode ? `, diverted to ${divertedCode}${divertedToCity ? ` (${divertedToCity})` : ''}` : ''}.
Write ONE factual sentence (max 25 words) about the most important fact. Only mention departure time, arrival time, delay amount, or diversion destination. No filler.`;
      const commentResult = await commentModel.generateContent(commentPrompt);
      aiComment = commentResult.response.text().trim().replace(/^["']|["']$/g, '');
    } catch (e) {
      // Silent — AI comment is optional
    }
  }

  // 9. Construct Final UI Object
  const parsedUIStats = {
    bannerBg, bannerTextCol, bannerText, flightDuration, operatorName,
    rawStatus, divertedTo: divertedCode, divertedToCity, arrTimeDataPending,
    depIata, depCity, depName,
    depDate: formatDate(sDep.dateLocal),
    depSched: formatTime(sDep.dateLocal),
    depSchedZone: calculateUtcOffset(sDep.dateLocal, sDep.dateUtc),
    depActual: formatTime(aDep.dateLocal),
    depActualZone: calculateUtcOffset(aDep.dateLocal, aDep.dateUtc),
    depActualLabel,
    arrIata, arrCity, arrName,
    arrDate: formatDate(sArr.dateLocal),
    arrSched: formatTime(sArr.dateLocal),
    arrSchedZone: calculateUtcOffset(sArr.dateLocal, sArr.dateUtc),
    arrActual: formatTime(aArr.dateLocal),
    arrActualZone: calculateUtcOffset(aArr.dateLocal, aArr.dateUtc),
    arrActualLabel: arrTimeDataPending ? 'Data Pending' : arrActualLabel,
    arrDelay: arrDelayStr, arrDelayColor, aiComment
  };

  res.json({ aiStats: parsedUIStats, rawResponse: data });
});

