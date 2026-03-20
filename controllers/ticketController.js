const { GoogleGenerativeAI } = require('@google/generative-ai');
const sharp = require('sharp'); 

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

exports.renderAnalyzer = (req, res) => {
  res.render('ticket-analyzer', { title: 'Ticket Analyzer' });
};

exports.analyzeTicket = async (req, res) => {
  try {
    const files = req.files && req.files.length > 0 ? req.files : [];
    
    if (files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });
    const currentYear = new Date().getFullYear();

    const prompt = `
      You are an expert aviation data extractor and legal evaluator. Analyze the attached travel document(s). 
      
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
      
      *LEG DISTANCE & CLAIM VALUE CALCULATION*:
      For EACH leg, estimate the Great Circle Distance between its origin and destination airports and output it in "distanceKm" (e.g., "3450 km").
      ONLY IF the leg is Eligible, calculate the claim value based on that distance:
      - Distance up to 1,500 km: Output "€250"
      - Distance between 1,500 km and 3,500 km: Output "€400"
      - Distance over 3,500 km: Output "€600"
      If the leg is Not Eligible, output "N/A" for estimatedClaimValue.

      STEP 4: OUTPUT FORMAT
      Return EXACTLY this JSON structure (an ARRAY of objects) and absolutely nothing else. Do not use markdown like \`\`\`json.
      
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
                    "estimatedClaimValue": "€250, €400, €600, or N/A"
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
    const parsedJourneys = JSON.parse(responseText);

    // --- SERVER-SIDE DB MATCHING LOGIC (FIXED) ---
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
                                // FIXED: Using Regex \b (Word Boundaries) to ensure exact word matches.
                                // This prevents "ai" from matching the letters inside "wizz air"
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

  } catch (error) {
    console.error("Ticket Analyzer Error:", error);
    res.status(500).json({ error: "Failed to analyze ticket(s). API rejected request." });
  }
};