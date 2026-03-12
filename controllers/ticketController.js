const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.renderAnalyzer = (req, res) => {
  res.render('ticket-analyzer', { title: 'Ticket Analyzer' });
};

exports.analyzeTicket = async (req, res) => {
  try {
    const files = req.files && req.files.length > 0 ? req.files : [];
    
    if (files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    const prompt = `
      You are an expert aviation data extractor and legal evaluator. Analyze the attached travel document(s). 
      
      *CRITICAL ROUND-TRIP LAW*: Under EC261 law, a round-trip ticket (e.g., Outbound: EU to Asia, Return: Asia to EU) is legally treated as TWO separate journeys, even if booked under the exact same PNR. 
      - If the document is a ONE-WAY trip, create a SINGLE journey object.
      - If the document is a ROUND-TRIP, you MUST split it into TWO separate journey objects in the array: one object for the Outbound route, and a completely separate object for the Return route. 
      - If multiple documents share the same PNR and are part of the SAME directional trip, combine them. Combine multiple passenger names.

      YOU MUST OUTPUT AN ARRAY OF JOURNEY OBJECTS.

      Follow these STRICT instructions step-by-step for EACH journey object:

      STEP 1: EXTRACT BASIC INFO
      - Passenger Name: (Combine names if multiple passengers share this exact journey/PNR).
      - PNR / Booking Code: MUST be 5 to 9 alphanumeric characters. IGNORE 13-digit e-ticket numbers, Sequence Numbers, or Frequent Flyer Numbers. If missing, output "Not Provided".

      STEP 2: EVALUATE OVERALL EC261 & UK261 ELIGIBILITY
      Treat this SPECIFIC directional journey (first origin of this route to final destination of this route) as a single unit.
      *CRITICAL LAW*: EC261/UK261 liability falls strictly on the OPERATING carrier, NOT the marketing carrier.
      
      *Definitions:*
      - EU: 27 member states, Iceland, Norway, Switzerland, Canary Islands, Madeira, Azores, Guadeloupe. (Ireland/DUB is EU).
      - UK: England, Scotland, Wales, Northern Ireland.
      - NON-EU/NON-UK: USA, China, Qatar, Turkey, UAE, Canada, India, etc.
      - EU Carrier (Operating): Lufthansa, Air France, KLM, Iberia, Wizz Air, Aer Lingus, etc.
      - UK Carrier (Operating): British Airways, Virgin Atlantic, easyJet UK, etc.
      
      *Overall Evaluation Rules (Evaluate in order based on OPERATING airline of the legs):*
      1. Starts in EU or UK -> OVERALL JOURNEY IS ALWAYS ELIGIBLE. (Airline and final destination do not matter).
      2. Starts NON-EU/UK -> Ends NON-EU/UK -> OVERALL JOURNEY IS ALWAYS NOT ELIGIBLE. 
      3. Starts NON-EU/UK -> Ends in EU -> Eligible ONLY IF OPERATING airline is an EU Carrier. (If non-EU carrier, it is Not Eligible).
      4. Starts NON-EU/UK -> Ends in UK -> Eligible ONLY IF OPERATING airline is a UK or EU Carrier.

      STEP 3: EXTRACT ROUTES & LEGS
      Assign this route's type (e.g., "Outbound" or "Return").
      For each leg, carefully extract operating vs booked (marketing) details.
      - marketingAirline: Who the ticket was bought from.
      - operatingAirline: Who actually flies the plane (e.g., "Operated by..."). If not stated, assume it's the marketing airline.
      - operatingAirlineCountry: The home country of the OPERATING airline.
      - flightNumber: Include both if codeshare (e.g., "BA123 / AA456").
      
      *CRITICAL REBOOKING LOGIC*: DO NOT discard obsolete/cancelled flights. If the documents show a disrupted timeline (e.g., an original AUH->BLR flight on Jan 31, but also a rebooked AUH->MCT flight on Feb 1), INCLUDE ALL LEGS. However, you MUST set the "flightStatus" field to "Cancelled/Rebooked" for the obsolete/replaced flights, and "Scheduled" for the final flown flights.
      
      *CRITICAL LEG-BY-LEG EVALUATION RULES:*
      - IF this overall directional journey is "Eligible": EVERY SINGLE LEG in it is automatically "Eligible".
      - IF this overall directional journey is "Not Eligible": EVERY SINGLE LEG is automatically "Not Eligible", UNLESS a specific connecting leg DEPARTS from an EU/UK airport.

      STEP 4: OUTPUT FORMAT
      Return EXACTLY this JSON structure (an ARRAY of objects) and absolutely nothing else. Do not use markdown like \`\`\`json.
      
      [
        {
          "passengerName": "",
          "pnr": "",
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
                  "date": "",
                  "ec261Leg": {
                    "legOriginCountry": "Leg starting country (Label: EU, UK, or NON-EU)",
                    "legDestinationCountry": "Leg destination country (Label: EU, UK, or NON-EU)",
                    "status": "Eligible or Not Eligible",
                    "reason": "Explain based on rules."
                  }
                }
              ]
            }
          ]
        }
      ]
    `;

    const documentParts = files.map(file => ({
      inlineData: {
        data: file.buffer.toString("base64"),
        mimeType: file.mimetype
      }
    }));

    const result = await model.generateContent([prompt, ...documentParts]);
    const responseText = result.response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
    
    res.json(JSON.parse(responseText));
  } catch (error) {
    console.error("Ticket Analyzer Error:", error);
    res.status(500).json({ error: "Failed to analyze ticket(s). API rejected request." });
  }
};