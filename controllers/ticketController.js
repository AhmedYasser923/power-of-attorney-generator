const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const sharp = require('sharp');

const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// --- LOAD DATABASES DIRECTLY FROM JSON ---
const eocDatabase = require('../eoc_data.json');
const airportsDatabase = require('../airports_data.json'); 
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

const jurisdictionLimits = {
  "poland": 1, "belgium": 5, "italy": 2, "netherlands": 2, "the netherlands": 2,
  "switzerland": 2, "croatia": 2, "iceland": 2, "slovakia": 2, "slovenia": 2,
  "germany": 3, "austria": 3, "denmark": 3, "finland": 3, "norway": 3,
  "portugal": 3, "romania": 3, "sweden": 3, "czech republic": 3, "bulgaria": 3,
  "estonia": 3, "latvia": 3, "lithuania": 3, "spain": 5, "france": 5,
  "greece": 5, "hungary": 5, "uk": 6, "united kingdom": 6, "ireland": 6,
  "cyprus": 6, "malta": 6, "luxembourg": 10
};

exports.renderAnalyzer = catchAsync(async (req, res, next) => {
  res.render('ticket-analyzer', { title: 'Ticket Analyzer' });
});

exports.analyzeTicket = catchAsync(async (req, res, next) => {
  const files = req.files && req.files.length > 0 ? req.files : [];
  const journeyYear = req.body.journeyYear; 

  if (files.length === 0) {
    return next(new AppError('No files uploaded', 400));
  }

  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

  let yearDirective = "";
  if (journeyYear) {
    yearDirective = `\n    🚨 *** GLOBAL JOURNEY YEAR PROVIDED: ${journeyYear} *** 🚨\n    The user has explicitly confirmed the travel year is ${journeyYear}. If a flight date on the ticket only shows Day and Month (e.g., '25 Mar'), you MUST use ${journeyYear} to format the 'date' field as 'YYYY-MM-DD' (e.g., '${journeyYear}-03-25').`;
  }

const prompt = `
    You are an expert aviation data extractor and legal evaluator. Analyze ALL the attached travel document(s). try not to exceed 40s in analyzing
    ${yearDirective}
    🚨 ***ANTI-LAZINESS & ZERO-HALLUCINATION DIRECTIVE*** 🚨
    You MUST extract EVERY SINGLE flight leg and EVERY SINGLE passenger found across ALL provided documents. Do NOT skip, summarize, or omit any flights.
    
    🧠 ***THE ANALYTICAL FRAMEWORK (CHAIN OF THOUGHT)*** 🧠
    Before generating the JSON, you must mentally process the documents using this exact sequence:
    1. Entity Grouping: Identify all unique passengers. If multiple passengers share the exact same flight numbers, dates, and routes, treat them as a single traveling party.
    2. Chronological Sequencing: Extract every single flight leg shown across all documents and arrange them strictly by Date and Departure Time to build a master timeline. FLIGHTS WITH THE SAME PNR SHOULD BE GROUPED TOGETHER IN IT'S OWN JOURNEY
    3. Anomaly Detection (Disruptions): Look for logical breaks or overlaps in the timeline. If a passenger has tickets for a direct flight (A ➔ B), AND tickets for a multi-leg flight reaching the same destination (A ➔ C ➔ B) within 48 hours, this is a Disruption/Rebooking. 
    4. Deductive Reasoning: Apply the EC261 legal rules to the *entire* chronologically sequenced journey, basing the jurisdiction solely on the very first origin point in the timeline.

    *CRITICAL DATE INFERENCE RULES (100% PRECISION REQUIRED)*: 
    1. AVOID ANCHORING VIA RAW EXTRACTION: In round-trip or multi-leg itineraries, EVERY flight has its own unique date. You MUST extract the exact raw date string printed specifically for EACH flight leg and place it in the "rawExtractedDate" field. Do NOT reuse dates.
    2. IGNORE ISSUE DATES: The "Issue Date", "Booking Date", or "Printed Date" is NEVER the flight date. Ignore it completely.
    3. NO YEAR ASSUMPTIONS: If the document only shows the day and month (e.g., "25 Mar"), DO NOT assume or append the current year. Output EXACTLY the explicit day and month you see. Only format as YYYY-MM-DD if the year is explicitly printed.

    *CRITICAL JOURNEY SPLITTING LAWS (EC261)*:
    1. ROUND-TRIPS: A round-trip ticket is legally treated as TWO separate journeys. Split them into one Outbound journey object and one Return journey object.
    2. SELF-TRANSFERS & SEPARATE TICKETS: If the document explicitly states "Self transfer", OR if consecutive flights are completely unrelated contracts, split them into SEPARATE journey objects.
    3. PASSENGERS: Combine multiple passengers into the SAME journey object if they share the exact same itinerary.
    4. REBOOKINGS & RE-ROUTINGS (THE DISRUPTION OVERRIDE RULE): If the documents show the SAME passenger holding tickets for an original flight AND an alternative/multi-leg flight reaching the SAME final destination, this is a REBOOKING. Group them in the SAME journey object. Sort the timeline logically based on departure time. Mark any abandoned or unused original legs strictly as "Unused / Missed Connection" (unless explicitly printed as Cancelled). Mark the newly issued alternative legs strictly as "Replacement Flight". IF a replacement flight is ALSO missed/unused, mark it strictly as "Unused Replacement Flight".

    YOU MUST OUTPUT AN ARRAY OF JOURNEY OBJECTS.

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
    
    STEP 4: OUTPUT FORMAT
    *** IMPORTANT *** If no flight data exists, return ONLY an empty JSON array: []
    Otherwise, return EXACTLY this JSON structure (an ARRAY of objects) and absolutely nothing else. Do not use markdown.
    
    [
      {
        "passengers": [
          {
            "firstName": "[String]",
            "lastName": "[String]",
            "ticketNumber": "[String: STRICTLY 13 NUMERIC DIGITS. NO LETTERS. If listed per-leg, match the number to this journey's flights. If missing or 'Not required', output 'Not Provided']"
          }
        ],
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
                "printedReference": "[String: The raw alphanumeric reference physically printed in text on the document (e.g., '7464F99C', 'LXC6A4E3', '2720911'). Extract exactly as printed. If missing, output 'Not Provided']",
                "pnr": "[String: The EXACT True airline PNR. Standard airlines use 6 alphanumeric characters. 🚨 NUMERIC EXCEPTION: If the airline is on the Numeric Exception List (e.g., Corendon, TUI, Condor, Sunclass, etc.), their printed numeric code IS the True PNR; output that exact number here. If standard airline and true PNR is hidden/unreadable, output 'Requires Scan'.]",
                "flightStatus": "[String: 'Scheduled', 'Flown', 'Unused / Missed Connection', 'Cancelled', 'Replacement Flight', or 'Unused Replacement Flight']",
                "marketingAirline": "[String]",
                "marketingAirlineCountry": "[String: Home country of the booked/marketing airline, e.g., 'France']",
                "operatingAirline": "[String]",
                "operatingAirlineCountry": "[String: Home country of the operating airline, e.g., 'Germany']",
                "flightNumbers": ["[String]", "[String]"],
                "originIata": "[String]",
                "originName": "[String]",
                "originCity": "[String]",
                "originCountry": "[String]",
                "departureTime": "[String: Extract the exact departure time. If the departure time is NOT explicitly printed on the document (do NOT use boarding time), output '--:--']",
                "arrivalTime": "[String: Extract the exact arrival time. If the arrival time is NOT explicitly printed on the document, output '--:--']",
                "destinationIata": "[String]",
                "destinationName": "[String]",
                "destinationCity": "[String]",
                "destinationCountry": "[String]",
                "rawExtractedDate": "[String]",
                "date": "[String: YYYY-MM-DD if year is explicitly printed, otherwise exact Day and Month seen]",
                "ec261Leg": {
                  "legOriginCountry": "[String]",
                  "legDestinationCountry": "[String]",
                  "status": "[String]",
                  "reason": "[String]",
                  "claimExpiration": {
                    "originYears": "[String]",
                    "destinationYears": "[String]",
                    "marketingAirlineYears": "[String]",
                    "operatingAirlineYears": "[String]",
                    "bestCountry": "[String]",
                    "bestYears": "[String]",
                    "expirationDate": "[String: YYYY-MM-DD or N/A]",
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

  // 🚨 NEW AUTO-RETRY LOGIC WITH EXPONENTIAL BACKOFF 🚨
  let result;
  const maxRetries = 2; // Total of 3 attempts
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`⏳ Sending request to Gemini API... (Attempt ${attempt + 1})`);
      result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }, ...documentParts] }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      });
      console.log("✅ Received response from Gemini.");
      break; // Success! Break out of the retry loop
    } catch (apiError) {
      if (attempt === maxRetries) {
        // Out of retries, throw the error back to the user
        console.error("🔥 GEMINI API CRASHED (All retries failed):");
        console.error(apiError);
        return next(new AppError(`AI Processing Failed after 3 attempts: ${apiError.message}`, 500));
      }
      // Wait 2 seconds, then 4 seconds...
      const waitTime = (attempt + 1) * 2000;
      console.warn(`[Gemini API] Transient error detected: ${apiError.message}. Retrying in ${waitTime/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, waitTime)); 
    }
  }

  const endTime = Date.now();

  const processingTimeInSeconds = ((endTime - startTime) / 1000).toFixed(2);

  const responseText = result.response.text();

  let parsedJourneys;
  try {
    parsedJourneys = JSON.parse(responseText);
  } catch (parseErr) {
    return next(new AppError('The AI returned an unparseable response. Please try again.', 502));
  }

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
            
            // --- PROGRAMMATIC FAIL-SAFE 1: STRIP SPACES & FIX AI SPLITTING ---
            if (leg.flightNumbers && Array.isArray(leg.flightNumbers)) {
              let cleaned = leg.flightNumbers.map(fNum => fNum.replace(/[\s-]/g, '').trim()).filter(Boolean);
              let merged = [];
              for (let i = 0; i < cleaned.length; i++) {
                  if (i < cleaned.length - 1 && /^[A-Za-z0-9]{2,3}$/.test(cleaned[i]) && /^\d{1,4}$/.test(cleaned[i+1])) {
                      merged.push(cleaned[i] + cleaned[i+1]);
                      i++; 
                  } else {
                      merged.push(cleaned[i]);
                  }
              }
              leg.flightNumbers = merged;
            }

            // 0. --- PROGRAMMATIC DISTANCE & COMPENSATION CALCULATION ---
            const oIata = (leg.originIata || '').toUpperCase();
            const dIata = (leg.destinationIata || '').toUpperCase();
            
            const originPort = airportsDatabase.find(a => a.iata && a.iata.toUpperCase() === oIata);
            const destPort = airportsDatabase.find(a => a.iata && a.iata.toUpperCase() === dIata);
            
            leg.ec261Leg = leg.ec261Leg || {};

            if (originPort && destPort) {
                const R = 6371; 
                const dLat = (destPort.lat - originPort.lat) * Math.PI / 180;
                const dLon = (destPort.lon - originPort.lon) * Math.PI / 180;
                const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                          Math.cos(originPort.lat * Math.PI / 180) * Math.cos(destPort.lat * Math.PI / 180) *
                          Math.sin(dLon/2) * Math.sin(dLon/2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                const distance = Math.round(R * c);

                leg.distanceKm = `${distance} km`;

                const euCountries = ["austria", "belgium", "bulgaria", "croatia", "cyprus", "czech republic", "denmark", "estonia", "finland", "france", "germany", "greece", "hungary", "ireland", "italy", "latvia", "lithuania", "luxembourg", "malta", "netherlands", "the netherlands", "poland", "portugal", "romania", "slovakia", "slovenia", "spain", "sweden", "iceland", "norway", "switzerland", "united kingdom", "uk"];
                
                const oCountry = (leg.originCountry || '').toLowerCase().trim();
                const dCountry = (leg.destinationCountry || '').toLowerCase().trim();
                const isIntraEU = euCountries.includes(oCountry) && euCountries.includes(dCountry);

                if (distance <= 1500) {
                    leg.ec261Leg.estimatedClaimValue = "€250";
                } else if (isIntraEU || (distance > 1500 && distance <= 3500)) {
                    leg.ec261Leg.estimatedClaimValue = "€400";
                } else {
                    leg.ec261Leg.estimatedClaimValue = "€600";
                }
            } else {
                leg.distanceKm = "Unknown";
                leg.ec261Leg.estimatedClaimValue = "N/A";
            }

            // 1. --- DOCUMENT CHECKER LOGIC ---
            let marketing = leg.marketingAirline || "Unknown";
            let operating = leg.operatingAirline || marketing;

            // Get airline HQ jurisdiction limit (Operating)
            const opCountry = (leg.operatingAirlineCountry || '').toLowerCase().trim();
            const opLimitRaw = jurisdictionLimits[opCountry] || 'N/A';
            const opLimitFormatted = opLimitRaw !== 'N/A' ? `${opLimitRaw} years` : 'N/A';
            const displayOpCountry = leg.operatingAirlineCountry && leg.operatingAirlineCountry !== 'Unknown' ? leg.operatingAirlineCountry : 'Unknown HQ';

            // Get airline HQ jurisdiction limit (Marketing)
            const mktCountry = (leg.marketingAirlineCountry || '').toLowerCase().trim();
            const mktLimitRaw = jurisdictionLimits[mktCountry] || 'N/A';
            const mktLimitFormatted = mktLimitRaw !== 'N/A' ? `${mktLimitRaw} years` : 'N/A';
            const displayMktCountry = leg.marketingAirlineCountry && leg.marketingAirlineCountry !== 'Unknown' ? leg.marketingAirlineCountry : 'Unknown HQ';

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
                docsList.push({ airline: marketing, role: "", reqs: getReqs(marketing), hq: displayOpCountry, limit: opLimitFormatted });
            } else {
                // Attach the marketing HQ limit to the booked airline row
                docsList.push({ airline: marketing, role: "Booked", reqs: getReqs(marketing), hq: displayMktCountry, limit: mktLimitFormatted });
                docsList.push({ airline: operating, role: "Operated", reqs: getReqs(operating), hq: displayOpCountry, limit: opLimitFormatted });
            }
            leg.claimDocuments = docsList;

            // 2. --- ENHANCED JURISDICTION OVERRIDE LOGIC ---
            if (leg.ec261Leg && leg.ec261Leg.claimExpiration) {
                const oCountry = (leg.originCountry || '').toLowerCase().trim();
                const dCountry = (leg.destinationCountry || '').toLowerCase().trim();
                
                let oLimit = jurisdictionLimits[oCountry] || 'N/A';
                let dLimit = jurisdictionLimits[dCountry] || 'N/A';
                
                leg.ec261Leg.claimExpiration.originYears = oLimit;
                leg.ec261Leg.claimExpiration.destinationYears = dLimit;
                leg.ec261Leg.claimExpiration.operatingAirlineYears = opLimitRaw;
                leg.ec261Leg.claimExpiration.marketingAirlineYears = mktLimitRaw;

                let bestLimit = 0;
                let bestCountryName = 'Unknown';

                if (oLimit !== 'N/A' && oLimit > bestLimit) {
                    bestLimit = oLimit;
                    bestCountryName = leg.originCountry;
                }
                
                if (dLimit !== 'N/A' && dLimit > bestLimit) {
                    bestLimit = dLimit;
                    bestCountryName = leg.destinationCountry;
                }

                if (opLimitRaw !== 'N/A' && opLimitRaw > bestLimit) {
                    bestLimit = opLimitRaw;
                    bestCountryName = leg.operatingAirlineCountry;
                }

                if (mktLimitRaw !== 'N/A' && mktLimitRaw > bestLimit) {
                    bestLimit = mktLimitRaw;
                    bestCountryName = leg.marketingAirlineCountry;
                }

                if (bestLimit > 0 && leg.date && leg.date !== "Unknown") {
                    leg.ec261Leg.claimExpiration.bestYears = bestLimit;
                    leg.ec261Leg.claimExpiration.bestCountry = bestCountryName;
                    
                    const flightDate = new Date(leg.date);
                    if (!isNaN(flightDate.getTime())) {
                        flightDate.setFullYear(flightDate.getFullYear() + bestLimit);
                        leg.ec261Leg.claimExpiration.expirationDate = flightDate.toISOString().split('T')[0];
                        
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

exports.checkEOC = (req, res, next) => {
  try {
    const { date, originIata, destIata, originCountry, destCountry } = req.query;

    if (!date || date === 'Unknown') return res.json({ eocFound: false });

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

    if (matchedEvents.length > 0) res.json({ eocFound: true, events: matchedEvents });
    else res.json({ eocFound: false });
  } catch (error) {
    next(error);
  }
};

exports.checkFlightStatus = async (req, res, next) => {
  try {
    const { flightNumber, date, origin, destination } = req.query;
    if (!flightNumber || flightNumber === 'N/A') return res.json({ error: 'Valid flight number is required' });

    const ciriumAppId = process.env.CIRIUM_APP_ID;
    const ciriumAppKey = process.env.CIRIUM_APP_KEY;

    if (!ciriumAppId || !ciriumAppKey) return res.json({ error: 'Cirium API Credentials Missing. Check .env file.' });

    const cleanFlightNum = flightNumber.replace(/[^A-Za-z0-9]/g, '');
    const match = cleanFlightNum.match(/([A-Za-z]{3}|[A-Za-z0-9]{2})0*(\d{1,4})/);
    if (!match) return res.json({ error: `Invalid flight format (${flightNumber}).` });
    
    const carrier = match[1].toUpperCase();
    const fNum = match[2];

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

    const url = `https://api.flightstats.com/flex/flightstatus/rest/v2/json/flight/status/${carrier}/${fNum}/dep/${year}/${month}/${day}?appId=${ciriumAppId}&appKey=${ciriumAppKey}&utc=false`;
    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const data = await response.json();

    if (data.error) return res.json({ error: data.error.errorMessage || 'Cirium API Error' });
    if (!data.flightStatuses || data.flightStatuses.length === 0) return res.json({ error: `No flight data found in Cirium for ${carrier}${fNum} on ${date}.` });

    let targetFlight = data.flightStatuses[0];
    const requestedDateStr = `${year}-${month}-${day}`;

    let exactMatches = data.flightStatuses.filter(f => {
      const originMatches = !origin || origin === 'Unknown' || f.departureAirportFsCode === origin.toUpperCase();
      const destMatches = !destination || destination === 'Unknown' || f.arrivalAirportFsCode === destination.toUpperCase();
      const dateMatches = f.departureDate && f.departureDate.dateLocal && f.departureDate.dateLocal.startsWith(requestedDateStr);
      return originMatches && destMatches && dateMatches;
    });

    if (exactMatches.length === 0) {
        exactMatches = data.flightStatuses.filter(f => {
          const destMatches = !destination || destination === 'Unknown' || f.arrivalAirportFsCode === destination.toUpperCase();
          const dateMatches = f.departureDate && f.departureDate.dateLocal && f.departureDate.dateLocal.startsWith(requestedDateStr);
          return destMatches && dateMatches;
        });
    }

    if (exactMatches.length === 0) {
        exactMatches = data.flightStatuses.filter(f => {
          return f.departureDate && f.departureDate.dateLocal && f.departureDate.dateLocal.startsWith(requestedDateStr);
        });
    }

    let hasMultipleDisruptions = false;
    if (exactMatches.length > 0) {
      const statusPriority = { 'D': 1, 'C': 2, 'L': 3, 'A': 4, 'S': 5, 'U': 6 };
      exactMatches.sort((a, b) => (statusPriority[a.status] || 99) - (statusPriority[b.status] || 99));
      targetFlight = exactMatches[0];
      const uniqueStatuses = [...new Set(exactMatches.map(f => f.status))];
      if (uniqueStatuses.includes('D') && uniqueStatuses.includes('C')) hasMultipleDisruptions = true;
    }

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

    const ops = targetFlight.operationalTimes || {};
    const sDep = ops.scheduledGateDeparture || ops.scheduledRunwayDeparture || ops.publishedDeparture || {};
    const aDep = ops.actualGateDeparture || ops.estimatedGateDeparture || ops.actualRunwayDeparture || sDep;
    const sArr = ops.scheduledGateArrival || ops.scheduledRunwayArrival || ops.publishedArrival || {};
    const aArr = ops.actualGateArrival || ops.estimatedGateArrival || ops.actualRunwayArrival || sArr;

    const depActualLabel = (ops.actualGateDeparture || ops.actualRunwayDeparture) ? "Actual" : (ops.estimatedGateDeparture ? "Estimated" : "Scheduled");
    const arrActualLabel = (ops.actualGateArrival || ops.actualRunwayArrival) ? "Actual" : (ops.estimatedGateArrival ? "Estimated" : "Scheduled");

    const flightDuration = formatDuration(targetFlight.flightDurations?.scheduledBlockMinutes || 0);
    const arrDelayMins = targetFlight.delays?.arrivalGateDelayMinutes || targetFlight.delays?.arrivalRunwayDelayMinutes || 0;

    let arrDelayStr = "On Time";
    if (arrDelayMins > 0) {
      arrDelayStr = arrDelayMins >= 60 ? formatDuration(arrDelayMins) : `${arrDelayMins} mins`;
    }

    const rawStatus = targetFlight.status || 'U';
    const arrTimeDataPending = rawStatus === 'L' && !ops.actualGateArrival && !ops.actualRunwayArrival && !ops.estimatedGateArrival;

    const statusMap = { 'S': 'Scheduled', 'A': 'Active', 'L': 'Landed', 'C': 'Cancelled', 'D': 'Diverted', 'U': 'Unknown' };
    const statusText = statusMap[rawStatus] || 'Unknown';
    const bannerTextCol = '#ffffff';
    let bannerBg, bannerText, arrDelayColor;
    const divertedCode = rawStatus === 'D' ? (targetFlight.divertedAirportFsCode || '???') : null;

    switch (rawStatus) {
      case 'S':
        if (arrDelayMins > 0) {
          bannerBg = '#f59e0b'; bannerText = `SCHEDULED | Delayed ${arrDelayStr}`; arrDelayColor = '#ef4444';
        } else {
          bannerBg = '#3b82f6'; bannerText = 'SCHEDULED'; arrDelayStr = 'Scheduled'; arrDelayColor = '#3b82f6';
        }
        break;
      case 'A':
        if (arrDelayMins > 0) {
          bannerBg = '#f59e0b'; bannerText = `IN FLIGHT | Delayed ${arrDelayStr}`; arrDelayColor = '#ef4444';
        } else {
          bannerBg = '#3b82f6'; bannerText = 'IN FLIGHT'; arrDelayColor = '#22c55e';
        }
        break;
      case 'L':
        if (arrTimeDataPending) {
          bannerBg = '#f59e0b'; bannerText = 'LANDED | FINAL ARRIVAL PENDING'; arrDelayStr = 'Pending / Unknown'; arrDelayColor = '#f59e0b';
        } else if (arrDelayMins > 0) {
          bannerBg = '#f59e0b'; bannerText = `LANDED | ${arrDelayStr} Late`; arrDelayColor = '#ef4444';
        } else {
          bannerBg = '#22c55e'; bannerText = 'LANDED | On Time'; arrDelayColor = '#22c55e';
        }
        break;
      case 'C':
        bannerBg = '#ef4444'; bannerText = 'FLIGHT CANCELLED'; arrDelayStr = 'CANCELLED'; arrDelayColor = '#ef4444';
        break;
      case 'D':
        if (hasMultipleDisruptions) {
          bannerBg = '#991b1b'; bannerText = `DIVERTED & CANCELLED → ${divertedCode}`;
          arrDelayStr = 'DIVERTED/CANCELLED'; arrDelayColor = '#ef4444';
        } else {
          bannerBg = '#ef4444'; 
          if (arrDelayMins > 0) {
              bannerText = `DIVERTED → ${divertedCode} | Delayed ${arrDelayStr}`; arrDelayColor = '#ef4444';
          } else {
              bannerText = `DIVERTED → ${divertedCode}`; arrDelayStr = 'DIVERTED'; arrDelayColor = '#ef4444';
          }
        }
        break;
      default:
        bannerBg = '#64748b'; bannerText = 'STATUS UNKNOWN'; arrDelayStr = 'Unknown'; arrDelayColor = '#64748b';
    }

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

    let aiComment = null;
    if (hasMultipleDisruptions && rawStatus === 'D') {
      aiComment = `🚨 Double Disruption: The aircraft initially diverted to ${divertedCode || 'another airport'}, and the remainder of the journey was officially cancelled.`;
    } else if (arrTimeDataPending) {
      aiComment = `⚠️ Anomaly: The flight landed, but final arrival timestamps are missing from Cirium. This often indicates a prolonged tarmac delay or gate issue.`;
    } else if (['C', 'D', 'U'].includes(rawStatus) || arrDelayMins >= 30) {
      try {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const commentModel = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
        const commentPrompt = `Flight data: status=${statusText}, dep scheduled=${formatTime(sDep.dateLocal)} actual=${formatTime(aDep.dateLocal)}, arr scheduled=${formatTime(sArr.dateLocal)} actual=${formatTime(aArr.dateLocal)}, delay=${arrDelayMins} mins${divertedCode ? `, diverted to ${divertedCode}${divertedToCity ? ` (${divertedToCity})` : ''}` : ''}.
  Write ONE factual sentence (max 25 words) about the most important fact. Only mention departure time, arrival time, delay amount, or diversion destination. No filler.`;
        const commentResult = await commentModel.generateContent(commentPrompt);
        aiComment = commentResult.response.text().trim().replace(/^["']|["']$/g, '');
      } catch (e) {
        console.error("AI Comment Error:", e);
      }
    }

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

  } catch (error) {
    console.error("🔥 Flight Status Crash:", error);
    return res.json({ error: error.message || "An unexpected server error occurred." });
  }
};


// --- TCP CONNECTION KEEPALIVE (HEARTBEAT) ---
