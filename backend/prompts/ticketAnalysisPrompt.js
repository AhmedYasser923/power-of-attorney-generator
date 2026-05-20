'use strict';

function buildTicketAnalysisPrompt(yearDirective, journeyYear) {
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
    3. If only day+month shown (e.g. "25 Mar"), output exactly that in rawExtractedDate.${journeyYear
      ? ` For the date field, you MUST use ${journeyYear} as the year → output "${journeyYear}-MM-DD". Do NOT guess or use any other year — ONLY the document year (if printed) or ${journeyYear}.`
      : ' For the date field, output the partial as-is — NEVER assume, guess, or invent a year from context, current date, or any other source. EXCEPTION: if another uploaded document shows the SAME flight number on the SAME route with a full year, propagate that year per the CROSS-DOCUMENT YEAR PROPAGATION rule above. NOTE: when only day+month is shown and no fallback year is available, rawExtractedDate and date will hold the SAME partial string — this is expected, not a bug.'}

    🚨 JOURNEY SPLITTING:
    RULE 1 - SELF-TRANSFER: if you see "Self-transfer" / "Separate tickets" → split at that layover, each chunk is an INDEPENDENT journey.
    RULE 2 - STANDARD CONNECTIONS: normal layovers without self-transfer keywords → keep in SAME journey.
    RULE 3 - ROUND TRIPS: A→B then B→A at later date → TWO journey objects (Outbound + Return).
    RULE 4 - PASSENGER GROUPING: same flights, different PNRs → ONE journey. If multiple passengers carry different PNRs for the same leg, output them comma-separated in leg.pnr WITHOUT name labels (e.g. "SNMAUJ, XYZ123"). Per-passenger ticket numbers belong in passengerTickets — do NOT duplicate them inside the pnr field.
    PRECEDENCE: Apply RULE 1 (self-transfer split) FIRST. Then classify each resulting independent journey as Outbound/Return. The "missed connections stay in Outbound" guidance above applies WITHIN a journey, not across self-transfer splits.

    🚨 CODESHARE RULE:
    When a document shows multiple flight numbers for the SAME physical flight (e.g. "BA494 / AA7041",
    "Sold as AA7041", "Also marketed as XX123", or similar language indicating a codeshare partner):
    → Set flightNumbers to all codes (e.g. ["BA494", "AA7041"])
    → Set isCodeshare = true
    → This is ONE flight — do NOT treat it as a stopover.
    Example: Boarding pass for BA494 with text "Sold as AA7041" → flightNumbers=["BA494","AA7041"], isCodeshare=true

    🚨 UNKNOWN STOPOVER RULE (CRITICAL — NEVER GUESS):
    If a document shows a route like "A → B" with "1 stop" (or "2 stops") and multiple flight numbers
    (e.g. IB3862, IB3671) but does NOT explicitly name the connecting/intermediate airport(s):
    → Output ONE single leg from A to B with ALL flight numbers in the flightNumbers array.
    → Do NOT split into separate legs with a guessed connecting airport.
    → Do NOT infer the stopover based on airline hubs, common routes, or aviation knowledge.
    → Only create separate legs when each segment's origin AND destination are EXPLICITLY shown in the document.
    Example: "Ibiza (IBZ) to Oslo (OSL), 1 stop, IB3862/IB3671" with no intermediate city named
    → ONE leg: originIata="IBZ", destinationIata="OSL", flightNumbers=["IB3862","IB3671"]
    → NOT two legs IBZ→MAD→OSL (Madrid was never mentioned!)

    FLIGHT STATUS RULES (mutually exclusive — pick the FIRST that matches):
    "Cancelled" → REQUIRES EXPLICIT DOCUMENT EVIDENCE: text such as "CANCELLED", "CANCELED", "FLIGHT CANCELLED", "CXLD", a visible cancellation stamp, or an airline cancellation notice attached to THIS specific leg. ⚠️ NEVER infer "Cancelled" from passenger behavior, timeline gaps, missing boarding pass, or the existence of a later replacement flight. Absence of evidence is NOT evidence of cancellation.
    "Unused / Missed Connection" → passenger held a ticket for this leg but did not board it. 🚨 DEDUCTIVE RULE: If a passenger has a ticket for A ➔ B, but the timeline shows them flying out of city A later on a different flight (A ➔ C), the original A ➔ B flight MUST be tagged as "Unused / Missed Connection" — NEVER "Cancelled" (unless the document literally says so per the rule above).
    "Rescheduled" → SAME flight number, different time; populate originalDepartureTime + originalArrivalTime. ALSO populate originalDate (YYYY-MM-DD) when the flight was moved to a different calendar day.
    "Replacement Flight" → a new alternative routing (like the A ➔ C flight from the example above) that replaces the disrupted one.
    "Unused Replacement Flight" → replacement issued but also not boarded.
    "Flown" → passenger successfully completed this flight.
    "Scheduled" → default, no disruption evidence.
    KEY: If the timeline proves A→B was abandoned for a reroute, tag A→B as "Unused / Missed Connection". Use "Cancelled" ONLY when the document literally says the flight was cancelled.

    🕐 CRITICAL TIME EXTRACTION RULES (MANDATORY):

    TIME vs DATE SEPARATION:
      - departureTime / arrivalTime → TIME ONLY (HH:MM)
      - date / rawExtractedDate → DATE ONLY (YYYY-MM-DD or partial)

    NEVER MIX THEM. They are separate fields for a reason.

    COMMON EXTRACTION ERRORS TO AVOID:

    ❌ WRONG:
      {
        "date": "29 March",
        "departureTime": "2026-03-29T11:59:00",  // ISO datetime
        "arrivalTime": "2026-03-29T14:44:00"
      }

    ❌ WRONG:
      {
        "departureTime": "March 29 11:59",  // Date + time mixed
        "arrivalTime": "14:44 on 29 March"
      }

    ✅ CORRECT:
      {
        "date": "29 March",           // Date field ONLY
        "departureTime": "11:59",     // Time field ONLY (HH:MM)
        "arrivalTime": "14:44"        // Time field ONLY (HH:MM)
      }

    EXTRACTION PROTOCOL:
    1. When you see "Departure: 29 March 11:59"
       → date = "29 March"
       → departureTime = "11:59"

    2. When you see "2026-03-29T11:59:00"
       → date = "2026-03-29"
       → departureTime = "11:59"

    3. When you see "11:59 AM"
       → departureTime = "11:59" (convert AM/PM to 24h)

    4. When you see "Arrival Day+1"
       → Include "+1" in the notes/metadata, NOT in the time field
       → arrivalTime = "06:50" (time only)

    FORMAT ENFORCEMENT:
      - Output format: Always "HH:MM" (two digits : two digits)
      - Use 24-hour format: "14:44" not "2:44 PM"
      - Pad with zeros: "08:00" not "8:00"
      - If time is missing: output "--:--"

    🚨 MULTI-CARRIER PNR REALITY (CRITICAL):

    FUNDAMENTAL RULE: Each airline in a booking can issue its own PNR.

    SCENARIO 1 - Same Operating Carrier Throughout:
      Example: All flights operated by British Airways
      → ONE PNR applies to all legs (e.g., "7IQHOL")

    SCENARIO 2 - Multiple Operating Carriers (CODE-SHARE / INTERLINE):
      Example:
        - Leg 1: Booked BA, Operated AA → AA PNR (e.g., "SNMAUJ")
        - Leg 2: Booked BA, Operated BA → BA PNR (e.g., "7IQHOL")
        - Leg 3: Booked BA, Operated BA → BA PNR (same "7IQHOL")

      → EACH operating carrier has its own PNR!

    EXTRACTION PROTOCOL:
    1. SCAN for "Airline Booking Reference" field on the document
    2. FORMAT is usually: "CARRIER_CODE/PNR, CARRIER_CODE/PNR"
       Example: "AA/SNMAUJ, BA/7IQHOL"
    3. PARSE this into a mapping:
       {
         "AA": "SNMAUJ",
         "BA": "7IQHOL"
       }
    4. For EACH leg, assign the PNR based on the OPERATING carrier code:
       - If operatingAirline is "American Airlines" (AA) → pnr = "SNMAUJ"
       - If operatingAirline is "British Airways" (BA) → pnr = "7IQHOL"

    5. If document shows ONLY one PNR string (no carrier prefixes), and all
       flights are operated by the SAME carrier → use that single PNR for all

    6. If you cannot determine which PNR belongs to which carrier → output
       the FULL string as found (e.g., "AA/SNMAUJ, BA/7IQHOL") and let the
       server handle it

    VERIFICATION CHECKPOINT:
    Before finalizing JSON, ask yourself:
    - "Do I have flights operated by DIFFERENT airlines?"
    - "If yes, did I check for SEPARATE PNRs for each carrier?"
    - "Am I assigning the CORRECT carrier-specific PNR to each leg?"

    If the answer to any question is NO → re-scan the document.

    🔍 PNR ASSIGNMENT VERIFICATION (MANDATORY FINAL CHECK):

    Before outputting the final JSON, perform this validation:

    FOR EACH journey:
      unique_operators = list of distinct operatingAirline values in all legs

      IF unique_operators.length > 1:
        // Multi-carrier booking detected
        FOR EACH leg:
          CHECK: Does this leg's PNR match its operatingAirline?

          Example Check:
            If leg.operatingAirline = "American Airlines"
            AND leg.pnr = "7IQHOL" (which is a British Airways PNR)
            → ERROR: Cross-contamination detected!
            → ACTION: Re-scan document for AA-specific PNR

      ELSE:
        // Single carrier - one PNR is correct
        All legs can share the same PNR

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

    🔠 IATA PREFIX — GLYPH DISAMBIGUATION (CRITICAL):
    Whenever you can identify the operating/marketing airline by name, you MUST verify the 2-character IATA prefix of every flight number against the canonical IATA code you know for that airline. If the OCR-extracted glyph and the canonical code disagree on a commonly-confused character pair, OVERWRITE the OCR with the canonical character. Pairs to watch:
      • digit 0  ↔ letter O   (e.g. Norse Atlantic Airways is "N0…" not "NO…"; Norse Atlantic UK is "Z0…" not "ZO…")
      • digit 1  ↔ letter I or letter l
      • digit 5  ↔ letter S
      • digit 8  ↔ letter B
      • digit 2  ↔ letter Z
    Rule of thumb: the airline NAME is the ground truth, not the visual glyph. If the document says "Norse Atlantic Airways" and the flight number looks like "NO379", output "N0379". Apply this to ALL airlines whose IATA code legitimately contains a digit/letter that OCR commonly misreads. Do NOT invent codes for airlines you cannot name — only correct when the name + canonical code are both certain.

    🏢 AIRPORT NAMES (originName / destinationName):
    Always output the FULL official airport name. Do NOT abbreviate, shorten, or use the IATA code as a name.
    ✅ CORRECT: "Zurich Airport", "John F. Kennedy International Airport", "Amsterdam Airport Schiphol", "Belgrade Nikola Tesla Airport", "Lisbon Humberto Delgado Airport"
    ❌ WRONG: "JFK", "Schiphol", "Belgrade", "Zurich" (these are codes, city names, or partial names — give the full official airport name).
    If the document only prints a code or a partial name, expand it to the full official name. The IATA code already lives in originIata/destinationIata — do NOT repeat it in originName.

     
  `;
  return rawPrompt;
}

module.exports = { buildTicketAnalysisPrompt };
