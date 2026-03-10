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

    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

    // UPGRADED PROMPT: Dummy-proofed the departure rules to ignore carrier nationality
    const prompt = `
      You are an expert aviation data extractor and legal evaluator. Analyze the attached boarding pass(es), screenshot(s), or flight ticket(s).
      Examine the visual text in the images or PDFs carefully. They may belong to the same ticket or journey, so piece the information together logically.

      Extract the following information:
      - Passenger Name
      - PNR / Booking Code: STRICT FORMAT REQUIRED. Strictly 6 to 9 alphanumeric characters. Do NOT confuse it with a 13-digit e-ticket number, a Sequence Number (SEQ NO), or a Frequent Flyer Number. If a string is labeled as "Frequent Flyer No", "FFN", or "Member ID", YOU MUST IGNORE IT. If no explicit PNR or Booking Reference is found on the document, output "Not Provided".
      
      - EC261 & UK261 Eligibility: Evaluate the eligibility of the claim under European EC 261/2004 AND British UK261 regulations. Because these flights are on a single ticket/booking, evaluate the ENTIRE journey as a single unit (first origin to absolute final destination).
          
          *CRITICAL GEOGRAPHY DICTIONARY:* - "EU": Includes 27 member states, Iceland, Norway, Switzerland, AND EU Outermost Regions (Canary Islands, Madeira, Azores, Guadeloupe).
          - "UK": United Kingdom (England, Scotland, Wales, Northern Ireland). 
          - "NON-EU/NON-UK": USA, Turkey, UAE, Albania (Tirana is strictly NON-EU), Canada, Bahrain, Pakistan, etc.
          
          *CRITICAL CARRIERS:*
          - "EU Carrier": Lufthansa, Air France, KLM, Iberia, Wizz Air, Emerald Airlines, Aer Lingus, etc.
          - "UK Carrier": British Airways, Virgin Atlantic, easyJet UK, etc.
          - "Non-EU/UK Carrier": Turkish Airlines, Emirates, Delta, Pegasus, Alaska Airlines, Gulf Air, etc.

          *EVALUATION RULES (If ANY apply, it is Eligible):*
          1. Journey starts in EU -> ALWAYS Eligible (EC261). THE AIRLINE DOES NOT MATTER.
          2. Journey starts in UK -> ALWAYS Eligible (UK261). THE AIRLINE DOES NOT MATTER.
          3. Journey starts NON-EU/NON-UK -> Ends in EU -> Eligible ONLY IF operating airline is an EU Carrier.
          4. Journey starts NON-EU/NON-UK -> Ends in UK -> Eligible ONLY IF operating airline is a UK or EU Carrier.
          5. Anything else -> Not Eligible. 

      - Routes (Array): Group the flights logically. 
        For EACH route, provide:
        - type (String): E.g., "Outbound", "Return".
        - legs (Array): The specific flights that make up this route. For each leg, extract the standard details (airline, flightNumber, originIata, originName, originCity, departureTime, destinationIata, destinationName, destinationCity, arrivalTime, date).
        
        CRITICAL INSTRUCTION FOR ec261Leg: You MUST evaluate THIS SPECIFIC LEG independently in absolute isolation, pretending the rest of the journey does not exist. Apply the strict Evaluation Rules above to this specific leg's origin, destination, and airline. Remember, if a leg departs from the UK or EU, it is ALWAYS eligible regardless of what airline is flying it.

      Return EXACTLY this JSON structure and nothing else. Do not use markdown formatting:
      {
        "passengerName": "",
        "pnr": "",
        "ec261": {
          "firstOriginCountry": "State the actual starting country and label it (EU, UK, or NON-EU)",
          "finalDestinationCountry": "State the actual final destination country and label it (EU, UK, or NON-EU)",
          "status": "Eligible or Not Eligible",
          "reason": "Based strictly on the origin and destination labels above, state the reason."
        },
        "routes": [
          {
            "type": "",
            "legs": [
              {
                "airline": "",
                "flightNumber": "",
                "originIata": "",
                "originName": "",
                "originCity": "",
                "departureTime": "",
                "destinationIata": "",
                "destinationName": "",
                "destinationCity": "",
                "arrivalTime": "",
                "date": "",
                "ec261Leg": {
                  "legOriginCountry": "State this specific leg's origin country and label it (EU, UK, or NON-EU)",
                  "legDestinationCountry": "State this specific leg's destination country and label it (EU, UK, or NON-EU)",
                  "status": "Eligible or Not Eligible",
                  "reason": "Brief reason based STRICTLY on this isolated leg's geography and airline. If departing EU/UK, note that carrier does not matter."
                }
              }
            ]
          }
        ]
      }
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