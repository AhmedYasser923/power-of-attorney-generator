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

// --- EC261 STATUTE OF LIMITATIONS DATABASE (IN YEARS) ---
const jurisdictionLimits = {
  "poland": 1,
  "belgium": 1,
  "italy": 2,
  "netherlands": 2,
  "the netherlands": 2,
  "switzerland": 2,
  "croatia": 2,
  "iceland": 2,
  "slovakia": 2,
  "slovenia": 2,
  "germany": 3,
  "austria": 3,
  "denmark": 3,
  "finland": 3,
  "norway": 3,
  "portugal": 3,
  "romania": 3,
  "sweden": 3, // Note: Sweden is generally 3 for transport
  "czech republic": 3,
  "bulgaria": 3,
  "estonia": 3,
  "latvia": 3,
  "lithuania": 3,
  "spain": 5,
  "france": 5,
  "greece": 5,
  "hungary": 5,
  "uk": 6,
  "united kingdom": 6,
  "ireland": 6,
  "cyprus": 6,
  "malta": 6,
  "luxembourg": 10
};

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
    
    🚨 ***ANTI-LAZINESS & ZERO-HALLUCINATION DIRECTIVE*** 🚨
    You MUST extract EVERY SINGLE flight leg and EVERY SINGLE passenger found across ALL provided documents. Do NOT skip, summarize, or omit any flights.
    
    *CRITICAL DATE INFERENCE RULES (100% PRECISION REQUIRED)*: 
    1. AVOID ANCHORING VIA RAW EXTRACTION: In round-trip or multi-leg itineraries, EVERY flight has its own unique date. You MUST extract the exact raw date string printed specifically for EACH flight leg and place it in the "rawExtractedDate" field. Do NOT reuse dates. You must physically locate the departure date printed next to that specific leg's origin/destination.
    2. IGNORE ISSUE DATES: The "Issue Date", "Booking Date", or "Printed Date" (e.g., a date at the very top, very bottom, or labeled as "Date of Issue") is NEVER the flight date. Ignore it completely.
    3. CURRENT YEAR: The current year is ${currentYear}. If the true flight date lacks a year, you MUST assume ${currentYear} and format the final "date" field as YYYY-MM-DD.

    *CRITICAL ROUND-TRIP LAW*: Under EC261/UK261 law, a round-trip ticket is legally treated as TWO separate journeys. 
    - If the document is a ONE-WAY trip, create a SINGLE journey object.
    - If the document is a ROUND-TRIP, split it into TWO separate journey objects: one for the Outbound route, one for the Return route. 
    - Combine multiple passengers into the SAME journey object if they share the itinerary.

    YOU MUST OUTPUT AN ARRAY OF JOURNEY OBJECTS.

    STEP 1: EXTRACT PASSENGERS, TICKETS & PNRs
    - PNR / Booking Code: Extract the actual AIRLINE PNR. 🚨 CRITICAL RULE: DO NOT confuse the airline PNR with an Online Travel Agency (OTA) booking reference. Agency references are often purely numeric, much longer, or labeled "Agency Ref" at the top of the page. Airline PNRs are almost always EXACTLY 6 alphanumeric characters. You must ignore the agency reference and find the actual airline's record locator. Extract ALL 5 to 9 alphanumeric character airline PNRs found. If multiple exist, separate by commas. If missing, output "Not Provided".
    - Passengers & Tickets: Create an object for EACH passenger. You MUST accurately map their specific 13 or 14-digit e-ticket number to their name. If missing, output "Not Provided".
    - pnrNote: IF the "PNR" is "Not Provided" AND the marketing airline is in the special list below, output exactly: "💡 Note: For this airline, the 13-digit Ticket Number can be used in place of the PNR." Otherwise, leave empty ("").
      [SPECIAL AIRLINE LIST: Aero Contractors, Aeromexico, Air Albania, Air Cairo, Air China, Air Corsica, Air India, Air Mediterranean, Air Namibia, Air Nippon, Air Peace, Air Saint-Pierre, Air Senegal, Air Transat, Air Wisconsin, Akasa Air, American Airlines, Anima Wings, Arkia Israeli, Atlantic Airways, Austrian Airlines, Avianca, Azerbaijan Airlines, Azul, Bluebird Airways, BoA Boliviana, Corendon, Egyptair, Emerald Airlines, Emirates, Estelar, Ethiopian Airlines, Euroairlines, Fly Lili, Flyegypt, Flynas, GOL, GP Aviation, Hainan Airlines, Hifly, Icelandair, Kuwait Airways, La Compagnie, Lauda Europe, Nesma Airlines, Nile Air, Nouvelair, Oman Air, Pakistan International, Pegasus, Plus Ultra, Royal Air Maroc, Sky Vision, Skywest, T'way Air, TAP Air Portugal, Tarom, Tassili Airlines, Thai Airways, Tianjin Airlines, TUI, Tunisair, Turkish Airlines, Vietnam Airlines]

    STEP 2: EVALUATE OVERALL EC261 & UK261 ELIGIBILITY
    - EU: 27 member states, Iceland, Norway, Switzerland, Canary Islands, Madeira, Azores, Guadeloupe. (Ireland/DUB is EU).
    - UK: England, Scotland, Wales, Northern Ireland.
    - NON-EU/NON-UK: USA, China, Qatar, Turkey, UAE, Canada, India, Thailand, etc.
    1. Starts in EU or UK -> ALWAYS ELIGIBLE. 🚨 CRITICAL CONNECTING FLIGHT RULE: If the first flight of a journey departs from the EU/UK, ALL subsequent connecting flights on that exact same journey are automatically ELIGIBLE under EC261, even if those later legs are operated by a non-EU airline between two non-EU countries. Do NOT mark connecting legs as "Not Eligible" if the journey originated in the EU/UK.
    2. Starts NON-EU/UK -> Ends NON-EU/UK -> ALWAYS NOT ELIGIBLE. 
    3. Starts NON-EU/UK -> Ends in EU or UK -> Eligible ONLY IF OPERATING airline is an EU/UK Carrier.

    STEP 3: EXTRACT ROUTES & LEGS
    For each leg:
    - flightNumbers: ***CRITICAL*** Extract ALL flight numbers associated with this specific leg (e.g., the marketing flight number AND the operating codeshare flight number). You MUST output this as an ARRAY OF STRINGS (e.g., ["BA123", "AA456"]).
    - Evaluate leg eligibility, expiration limits (compare against ${currentDateFull}), and calculate distance claim values (€250, €400, €600, or N/A).

    STEP 4: OUTPUT FORMAT
    *** IMPORTANT *** If no flight data exists, return ONLY an empty JSON array: []
    Otherwise, return EXACTLY this JSON structure (an ARRAY of objects) and absolutely nothing else. Do not use markdown.
    
    [
      {
        "passengers": [
          {
            "firstName": "[String]",
            "lastName": "[String]",
            "ticketNumber": "[String]"
          }
        ],
        "pnr": "[String: Comma separated list of all PNRs]",
        "pnrNote": "[String]",
        "ec261": {
          "firstOriginCountry": "[String]",
          "finalDestinationCountry": "[String]",
          "status": "[String]",
          "reason": "[String]"
        },
        "routes": [
          {
            "type": "[String: Outbound or Return]",
            "legs": [
              {
                "flightStatus": "[String: Scheduled or Cancelled/Rebooked]",
                "marketingAirline": "[String]",
                "operatingAirline": "[String]",
                "operatingAirlineCountry": "[String]",
                "flightNumbers": ["[String]", "[String]"],
                "originIata": "[String]",
                "originName": "[String]",
                "originCity": "[String]",
                "originCountry": "[String]",
                "departureTime": "[String]",
                "destinationIata": "[String]",
                "destinationName": "[String]",
                "destinationCity": "[String]",
                "destinationCountry": "[String]",
                "arrivalTime": "[String]",
                "rawExtractedDate": "[String: STRICTLY the exact characters printed on the ticket for this leg's date. DO NOT INVENT EXAMPLES]",
                "date": "YYYY-MM-DD",
                "distanceKm": "[String]",
                "ec261Leg": {
                  "legOriginCountry": "[String]",
                  "legDestinationCountry": "[String]",
                  "status": "[String]",
                  "reason": "[String]",
                  "estimatedClaimValue": "[String]",
                  "claimExpiration": {
                    "originYears": "[String]",
                    "destinationYears": "[String]",
                    "airlineYears": "[String]",
                    "bestCountry": "[String]",
                    "bestYears": "[String]",
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
            // 1. --- DOCUMENT CHECKER LOGIC ---
            let marketing = leg.marketingAirline || "Unknown";
            let operating = leg.operatingAirline || marketing;

            const getReqs = (airlineName) => {
              if (!airlineName || airlineName === "Unknown") return "No documents required";
              const normalized = airlineName.toLowerCase();
              for (const item of airlineRequirements) {
                if (item.names.some(keyword => new RegExp(`\\b${keyword}\\b`, 'i').test(normalized))) {
                  return item.reqs;
                }
              }
              return "No documents required";
            };

            let docsList = [];
            if (marketing === operating) {
                docsList.push({ airline: marketing, role: "", reqs: getReqs(marketing) });
            } else {
                docsList.push({ airline: marketing, role: "Booked", reqs: getReqs(marketing) });
                docsList.push({ airline: operating, role: "Operated", reqs: getReqs(operating) });
            }
            leg.claimDocuments = docsList;

            // 2. --- JURISDICTION OVERRIDE LOGIC ---
            if (leg.ec261Leg && leg.ec261Leg.claimExpiration) {
                const oCountry = (leg.originCountry || '').toLowerCase().trim();
                const dCountry = (leg.destinationCountry || '').toLowerCase().trim();
                
                let oLimit = jurisdictionLimits[oCountry] || 'N/A';
                let dLimit = jurisdictionLimits[dCountry] || 'N/A';
                
                leg.ec261Leg.claimExpiration.originYears = oLimit;
                leg.ec261Leg.claimExpiration.destinationYears = dLimit;

                // Calculate the "Best Country" mathematically
                let bestLimit = 0;
                let bestCountryName = 'Unknown';

                if (oLimit !== 'N/A') {
                    bestLimit = oLimit;
                    bestCountryName = leg.originCountry;
                }
                
                if (dLimit !== 'N/A' && dLimit > bestLimit) {
                    bestLimit = dLimit;
                    bestCountryName = leg.destinationCountry;
                }

                if (bestLimit > 0 && leg.date && leg.date !== "Unknown") {
                    leg.ec261Leg.claimExpiration.bestYears = bestLimit;
                    leg.ec261Leg.claimExpiration.bestCountry = bestCountryName;
                    
                    // Calculate exact expiration date based on the precise flight date
                    const flightDate = new Date(leg.date);
                    if (!isNaN(flightDate.getTime())) {
                        flightDate.setFullYear(flightDate.getFullYear() + bestLimit);
                        leg.ec261Leg.claimExpiration.expirationDate = flightDate.toISOString().split('T')[0];
                        
                        // Check if currently expired
                        const today = new Date();
                        leg.ec261Leg.claimExpiration.isExpired = today > flightDate;
                    }
                } else {
                    leg.ec261Leg.claimExpiration.bestYears = 'N/A';
                    leg.ec261Leg.claimExpiration.bestCountry = 'N/A';
                    leg.ec261Leg.claimExpiration.expirationDate = 'N/A';
                    leg.ec261Leg.claimExpiration.isExpired = false;
                }
            }
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

