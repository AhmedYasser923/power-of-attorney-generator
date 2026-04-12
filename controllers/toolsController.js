'use strict';

const airportsDatabase = require('../airports_data.json');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const catchAsync = require('../utils/catchAsync');
const AppError   = require('../utils/appError');

const EocRecord            = require('../models/EocRecord');
const { syncEocFromSheet } = require('../utils/syncEoc');

// --- Shared data helpers (jurisdiction + airline docs) ---
const {
  jurisdictionData,
  getJurisdictionLimit,
  getAirlineReqs,
} = require('../utils/dataLoader');

// Build the flat { "country": value } map the frontend JS (tools.js) expects.
// This is computed once at startup from jurisdiction_data.json so the frontend
// never needs its own hardcoded copy.
const jurisdictionLimitsForClient = Object.fromEntries(
  jurisdictionData.map(entry => [
    entry.country,
    entry.note ? entry.note : entry.years, // preserve display strings like "2 Months - 10"
  ])
);

let airlineDatabase = [];
try {
  airlineDatabase = require('../airlines_data.json');
} catch (err) {
  console.warn("⚠️ airlines_data.json not found. Please run 'node build_airlines.js' first.");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ---------------------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------------------

exports.renderTools = catchAsync(async (req, res, next) => {
  res.render('tools', {
    title: 'Tools Suite',
    jurisdictionLimits: jurisdictionLimitsForClient,
  });
});

// ---------------------------------------------------------------------------
// EOC CHECKER
// ---------------------------------------------------------------------------

exports.checkEOC = async (req, res, next) => {
  try {
    const { date, originIata, destIata, originCountry, destCountry } = req.query;
    if (!date || date === 'Unknown') return res.json({ eocFound: false });

    const oIata    = (originIata    || '').toLowerCase();
    const dIata    = (destIata      || '').toLowerCase();
    const oCountry = (originCountry || '').toLowerCase();
    const dCountry = (destCountry   || '').toLowerCase();

    // Collect non-empty location values to match against
    const locs = [oIata, dIata, oCountry, dCountry, 'world wide']
      .filter(v => v && v.trim());

    // Case-insensitive exact-match regex for any of those values
    const escaped = locs.map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const locRegex = new RegExp('^(' + escaped.join('|') + ')$', 'i');

    // Run both queries in parallel
    const [exactMatches, ongoingMatches] = await Promise.all([
      EocRecord.find({
        category: { $not: /ongoing/i },
        location: locRegex,
        date: date                        // exact date match
      }).lean(),
      EocRecord.find({
        category: /ongoing/i,
        location: locRegex,
        date: { $lte: date }              // event date <= flight date  (YYYY-MM-DD string compare works)
      }).lean()
    ]);

    const matchedEvents = [...exactMatches, ...ongoingMatches];
    res.json({ eocFound: matchedEvents.length > 0, events: matchedEvents });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// AIRPORT SEARCH
// ---------------------------------------------------------------------------

exports.searchAirports = (req, res, next) => {
  try {
    const q = (req.query.q || '').trim().toLowerCase();
    if (!q || q.length < 2) return res.json([]);

    const exactMatches      = [];
    const startsWithMatches = [];
    const includesMatches   = [];

    airportsDatabase.forEach(a => {
      const iata = (a.iata || '').toLowerCase();
      const city = (a.city || '').toLowerCase();
      const name = (a.name || '').toLowerCase();

      if (iata === q)                                     exactMatches.push(a);
      else if (iata.startsWith(q) || city.startsWith(q)) startsWithMatches.push(a);
      else if (iata.includes(q) || city.includes(q) || name.includes(q)) includesMatches.push(a);
    });

    res.json([...exactMatches, ...startsWithMatches, ...includesMatches].slice(0, 8));
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// FLIGHT STATUS (Cirium) — identical logic to ticketController
// ---------------------------------------------------------------------------

exports.checkFlightStatus = async (req, res, next) => {
  try {
    const { flightNumber, date, origin, destination } = req.query;
    if (!flightNumber || flightNumber === 'N/A')
      return res.json({ error: 'Valid flight number is required' });

    const ciriumAppId  = process.env.CIRIUM_APP_ID;
    const ciriumAppKey = process.env.CIRIUM_APP_KEY;
    if (!ciriumAppId || !ciriumAppKey) {
      console.error('[Cirium] Error: CIRIUM_APP_ID or CIRIUM_APP_KEY Missing in config.env!');
      return res.json({ error: 'Cirium API Credentials Missing. Check .env file.' });
    }

    const match = flightNumber.match(/([A-Za-z]{3}|[A-Za-z0-9]{2})\s*0*(\d{1,4})/);
    if (!match)
      return res.json({ error: `Invalid flight format (${flightNumber}). Expected format like 'LH458', 'VS207', or 'U28412'.` });

    const carrier = match[1].toUpperCase();
    const fNum    = match[2];

    let year, month, day;
    if (date && date !== 'Unknown') {
      [year, month, day] = date.split('-');
    } else {
      const today = new Date();
      year  = today.getFullYear();
      month = String(today.getMonth() + 1).padStart(2, '0');
      day   = String(today.getDate()).padStart(2, '0');
    }

    const url = `https://api.flightstats.com/flex/flightstatus/rest/v2/json/flight/status/${carrier}/${fNum}/dep/${year}/${month}/${day}?appId=${ciriumAppId}&appKey=${ciriumAppKey}&utc=false`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const data = await response.json();

    if (data.error) return res.json({ error: data.error.errorMessage || 'Cirium API Error' });
    if (!data.flightStatuses || data.flightStatuses.length === 0)
      return res.json({ error: `No flight data found in Cirium for ${carrier}${fNum} on ${date}.` });

    let targetFlight = data.flightStatuses[0];
    const requestedDateStr = `${year}-${month}-${day}`;

    let exactMatches = data.flightStatuses.filter(f => {
      const originMatches = !origin      || origin      === 'Unknown' || f.departureAirportFsCode === origin.toUpperCase();
      const destMatches   = !destination || destination === 'Unknown' || f.arrivalAirportFsCode   === destination.toUpperCase();
      const dateMatches   = f.departureDate?.dateLocal?.startsWith(requestedDateStr);
      return originMatches && destMatches && dateMatches;
    });

    if (!exactMatches.length) {
      exactMatches = data.flightStatuses.filter(f => {
        const destMatches = !destination || destination === 'Unknown' || f.arrivalAirportFsCode === destination.toUpperCase();
        return destMatches && f.departureDate?.dateLocal?.startsWith(requestedDateStr);
      });
    }
    if (!exactMatches.length) {
      exactMatches = data.flightStatuses.filter(f => f.departureDate?.dateLocal?.startsWith(requestedDateStr));
    }

    let hasMultipleDisruptions = false;
    if (exactMatches.length > 0) {
      const statusPriority = { D: 1, C: 2, L: 3, A: 4, S: 5, U: 6 };
      exactMatches.sort((a, b) => (statusPriority[a.status] || 99) - (statusPriority[b.status] || 99));
      targetFlight = exactMatches[0];
      const uniqueStatuses = [...new Set(exactMatches.map(f => f.status))];
      if (uniqueStatuses.includes('D') && uniqueStatuses.includes('C')) hasMultipleDisruptions = true;
    }

    const formatDate = ds => {
      if (!ds) return '--';
      const d = new Date(ds);
      const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${String(d.getDate()).padStart(2,'0')}-${m[d.getMonth()]}-${d.getFullYear()}`;
    };
    const formatTime = ds => {
      if (!ds) return '--:--';
      const d = new Date(ds);
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    };
    const calcOffset = (local, utc) => {
      if (!local || !utc) return 'Local';
      const diff = Math.round((new Date(local) - new Date(utc)) / 3600000);
      return diff >= 0 ? `UTC+${diff}` : `UTC${diff}`;
    };
    const formatDuration = mins => {
      if (!mins || isNaN(mins)) return '--h --m';
      return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    };

    const ops  = targetFlight.operationalTimes || {};
    const sDep = ops.scheduledGateDeparture  || ops.scheduledRunwayDeparture || ops.publishedDeparture || {};
    const aDep = ops.actualGateDeparture     || ops.estimatedGateDeparture   || ops.actualRunwayDeparture || sDep;
    const sArr = ops.scheduledGateArrival    || ops.scheduledRunwayArrival   || ops.publishedArrival    || {};
    const aArr = ops.actualGateArrival       || ops.estimatedGateArrival     || ops.actualRunwayArrival  || sArr;

    const depActualLabel = (ops.actualGateDeparture || ops.actualRunwayDeparture) ? 'Actual' : (ops.estimatedGateDeparture ? 'Estimated' : 'Scheduled');
    const arrActualLabel = (ops.actualGateArrival   || ops.actualRunwayArrival)   ? 'Actual' : (ops.estimatedGateArrival  ? 'Estimated' : 'Scheduled');

    const flightDuration = formatDuration(targetFlight.flightDurations?.scheduledBlockMinutes || 0);
    const arrDelayMins   = targetFlight.delays?.arrivalGateDelayMinutes || targetFlight.delays?.arrivalRunwayDelayMinutes || 0;
    let arrDelayStr = 'On Time';
    if (arrDelayMins > 0) arrDelayStr = arrDelayMins >= 60 ? formatDuration(arrDelayMins) : `${arrDelayMins} mins`;

    const rawStatus          = targetFlight.status || 'U';
    const arrTimeDataPending = rawStatus === 'L' && !ops.actualGateArrival && !ops.actualRunwayArrival && !ops.estimatedGateArrival;
    const bannerTextCol      = '#ffffff';
    const divertedCode       = rawStatus === 'D' ? (targetFlight.divertedAirportFsCode || '???') : null;
    let bannerBg, bannerText, arrDelayColor;

    switch (rawStatus) {
      case 'S':
        if (arrDelayMins > 0) { bannerBg = '#f59e0b'; bannerText = `SCHEDULED | Delayed ${arrDelayStr}`; arrDelayColor = '#ef4444'; }
        else                  { bannerBg = '#3b82f6'; bannerText = 'SCHEDULED'; arrDelayStr = 'Scheduled'; arrDelayColor = '#3b82f6'; }
        break;
      case 'A':
        if (arrDelayMins > 0) { bannerBg = '#f59e0b'; bannerText = `IN FLIGHT | Delayed ${arrDelayStr}`; arrDelayColor = '#ef4444'; }
        else                  { bannerBg = '#3b82f6'; bannerText = 'IN FLIGHT'; arrDelayColor = '#22c55e'; }
        break;
      case 'L':
        if (arrTimeDataPending)   { bannerBg = '#f59e0b'; bannerText = 'LANDED | FINAL ARRIVAL PENDING'; arrDelayStr = 'Pending / Unknown'; arrDelayColor = '#f59e0b'; }
        else if (arrDelayMins > 0){ bannerBg = '#f59e0b'; bannerText = `LANDED | ${arrDelayStr} Late`; arrDelayColor = '#ef4444'; }
        else                      { bannerBg = '#22c55e'; bannerText = 'LANDED | On Time'; arrDelayColor = '#22c55e'; }
        break;
      case 'C':
        bannerBg = '#ef4444'; bannerText = 'FLIGHT CANCELLED'; arrDelayStr = 'CANCELLED'; arrDelayColor = '#ef4444';
        break;
      case 'D':
        if (hasMultipleDisruptions) {
          bannerBg = '#991b1b'; bannerText = `DIVERTED & CANCELLED → ${divertedCode}`; arrDelayStr = 'DIVERTED/CANCELLED'; arrDelayColor = '#ef4444';
        } else {
          bannerBg = '#ef4444';
          bannerText = arrDelayMins > 0 ? `DIVERTED → ${divertedCode} | Delayed ${arrDelayStr}` : `DIVERTED → ${divertedCode}`;
          arrDelayStr = 'DIVERTED'; arrDelayColor = '#ef4444';
        }
        break;
      default:
        bannerBg = '#64748b'; bannerText = 'STATUS UNKNOWN'; arrDelayStr = 'Unknown'; arrDelayColor = '#64748b';
    }

    let depIata = targetFlight.departureAirportFsCode || 'N/A';
    let arrIata = targetFlight.arrivalAirportFsCode   || 'N/A';
    let depCity = depIata, arrCity = arrIata, depName = '', arrName = '';
    let divertedToCity = null;
    let operatorCode = targetFlight.operatingCarrierFsCode || targetFlight.carrierFsCode || carrier;
    let operatorName = operatorCode;

    if (data.appendix?.airports) {
      const dPort = data.appendix.airports.find(a => a.fs === depIata);
      if (dPort) { depCity = dPort.city || depIata; depName = dPort.name || ''; }
      const aPort = data.appendix.airports.find(a => a.fs === arrIata);
      if (aPort) { arrCity = aPort.city || arrIata; arrName = aPort.name || ''; }
      if (divertedCode) {
        const dvPort = data.appendix.airports.find(a => a.fs === divertedCode);
        if (dvPort) divertedToCity = dvPort.city || divertedCode;
      }
    }
    if (data.appendix?.airlines) {
      const opLine = data.appendix.airlines.find(a => a.fs === operatorCode || a.iata === operatorCode || a.icao === operatorCode);
      if (opLine) operatorName = opLine.name || operatorCode;
    }

    res.json({
      aiStats: {
        bannerBg, bannerTextCol, bannerText, flightDuration, operatorName,
        rawStatus, divertedTo: divertedCode, divertedToCity, arrTimeDataPending,
        depIata, depCity, depName,
        depDate: formatDate(sDep.dateLocal),
        depSched: formatTime(sDep.dateLocal), depSchedZone: calcOffset(sDep.dateLocal, sDep.dateUtc),
        depActual: formatTime(aDep.dateLocal), depActualZone: calcOffset(aDep.dateLocal, aDep.dateUtc), depActualLabel,
        arrIata, arrCity, arrName,
        arrDate: formatDate(sArr.dateLocal),
        arrSched: formatTime(sArr.dateLocal), arrSchedZone: calcOffset(sArr.dateLocal, sArr.dateUtc),
        arrActual: formatTime(aArr.dateLocal), arrActualZone: calcOffset(aArr.dateLocal, aArr.dateUtc),
        arrActualLabel: arrTimeDataPending ? 'Data Pending' : arrActualLabel,
        arrDelay: arrDelayStr, arrDelayColor,
      },
      rawResponse: data,
    });
  } catch (error) {
    console.error('🔥 Flight Status Crash:', error);
    return res.json({ error: error.message || 'An unexpected server error occurred.' });
  }
};

// ---------------------------------------------------------------------------
// DOCUMENT CHECKER
// ---------------------------------------------------------------------------

exports.checkDocs = catchAsync(async (req, res, next) => {
  const query = (req.query.airline || '').toLowerCase().trim();
  if (!query) return res.status(400).json({ error: 'Airline name is required' });

  const dbMatch      = airlineDatabase.find(a => a.name.toLowerCase() === query || a.iata.toLowerCase() === query);
  const displayAirline = dbMatch ? dbMatch.name : query;

  // getAirlineReqs returns "No documents required" when there's no specific entry
  const reqs    = getAirlineReqs(dbMatch ? dbMatch.name : query);
  const hasDocs = reqs !== 'No documents required';

  res.status(200).json({ airline: displayAirline, hasDocs, reqs });
});

// ---------------------------------------------------------------------------
// AIRLINE SEARCH
// ---------------------------------------------------------------------------

exports.searchAirlines = catchAsync(async (req, res, next) => {
  const query = (req.query.q || '').toLowerCase().trim();
  if (!query || query.length < 2) return res.json([]);

  const results = [];
  for (const airline of airlineDatabase) {
    if (airline.name.toLowerCase().includes(query) || airline.iata.toLowerCase().includes(query)) {
      results.push({ name: airline.name, iata: airline.iata });
    }
    if (results.length >= 10) break;
  }
  res.status(200).json(results);
});

// ---------------------------------------------------------------------------
// SMART EMAIL BUILDER
// ---------------------------------------------------------------------------

exports.generateEmail = catchAsync(async (req, res, next) => {
  const { language, missingDocs, customRequest } = req.body;

  if ((!missingDocs || missingDocs.length === 0) && !customRequest) {
    return next(new AppError('Please select at least one document, template, or enter a custom request', 400));
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const isRejection = missingDocs && missingDocs.some(item => item.includes('Rejection'));

  const baseTemplate = isRejection
    ? `BASE TEMPLATE:\n[Insert the exact text for the chosen rejection reason(s) here, translated and formatted professionally. DO NOT add any bullet points. DO NOT add the header "In order to proceed...". DO NOT add the footer "Please reply directly..."]`
    : `BASE TEMPLATE:\nIn order to proceed with your claim and process your compensation, we require the following information and documents:\n\n[Insert Bullet Points Here]\n\nPlease reply directly to this email with the requested information and documents at your earliest convenience. Once we receive them, our legal team will continue processing your compensation claim.`;

  const prompt = `
    You are an expert multilingual legal claims assistant for 'ReFly Management Limited'.
    Your task is to generate an email body based STRICTLY on the template below, filled with the requested items or templates.

    DETAILS:
    - Target Language: ${language}
    - Requested Items: ${missingDocs && missingDocs.length > 0 ? missingDocs.join(', ') : 'None'}
    ${customRequest ? `- Custom Request: ${customRequest}` : ''}

    INSTRUCTIONS FOR REQUESTED ITEMS:
    ${isRejection
      ? 'CRITICAL RULE: This is a REJECTION email. Do NOT ask the user for documents. Output ONLY the provided rejection text appropriately translated.'
      : 'Expand the requested items into clear, professional bullet points. CRITICAL RULE: For EVERY requested item, you MUST explicitly instruct the passenger on exactly HOW and WHERE to find that information.'}
    
    Use the following definitions/instructions for these specific items if requested and refine it more and make it professional and simple:
    - Boarding pass: Please provide a copy of the physical or digital boarding pass you received after checking in for your flight.
    - Ticket number: This is typically a 13-digit number that can be found on your booking confirmation email or e-ticket receipt. To find your ticket number, you can try the following methods:
Email confirmation: Check your email inbox for a confirmation message from the ticket provider. The ticket number is usually included in this email.
Account login: If you purchased the ticket through an online platform, log into your account on that website. Your ticket information, including the ticket number, should be available in your order history.
Mobile app: If you used a mobile app to purchase your ticket, check the app for a section like "My Tickets" or "Purchases".
Customer service: Contact the ticket provider's customer service. Give them all the information you have (like your name, purchase date, etc.) and they should be able to help you find your ticket number.
Physical tickets: If you have a physical ticket, the ticket number is usually printed on it.

    - PNR / Booking Reference: A booking reference is a unique code the airline uses to identify your reservation. It typically consists of 6 characters, a combination of letters and numbers (e.g., DF87G#, REDYYD, or L5W4NW). You can find it on your booking confirmation email or e-ticket, where it may be labeled as 'booking reference', 'reservation reference', 'booking code', or 'PNR' (Passenger Name Record).
    - ID / Passport: Please provide a clear, color copy of your valid ID or Passport.
    - Signed Power of Attorney: Please sign and return the attached Power of Attorney document.
    - Booking confirmation: Please provide the original booking confirmation email or PDF from the airline or travel agency.
    - Proof of delay: According to public flight records, this flight shows no reported disruption or delay. If your flight was indeed delayed, we kindly ask you to provide official proof to support your claim. This could be: An email or SMS from the airline confirming the delay, a screenshot of the flight status showing the delay, the actual arrival time at your final destination, or an elaborate description of the situation.
    - Proof of cancellation: According to public flight records, this flight shows no reported disruption or delay. If your flight was indeed canceled, we kindly ask you to provide official proof. This could be: An email or SMS from the airline confirming the cancellation, a screenshot of the flight status showing it was canceled, a cancellation certificate from the airline, or any other official document serving proof of the cancellation.
    - Visa/Documentation Rejection: We understand how distressing it must have been for you  to be unable to board due to documentation issues. After reviewing your case, we must clarify that EC261/2004 applies only to delays, cancellations, or denied boarding resulting from factors such as overbooking or operational issues. Please note that ensuring all visa and entry requirements are met is the passenger's responsibility. Any impact on boarding or travel caused by visa or documentation issues falls outside the airline's responsibility and does not qualify for compensation under EC261. Consequently, we are unable to pursue compensation under EC261 for this incident. We recommend contacting the airline directly regarding any additional costs incurred, as they may be able to provide further assistance.
    - Short Delay / No Missed Connection Rejection: After carefully reviewing your case, we are unfortunately unable to proceed with your compensation claim. Although your initial flight experienced a delay, it did not result in a missed connection. As your final arrival was either on time or delayed by less than three hours, the airline is not legally liable for compensation under current aviation regulations.
    - No Disruption Found Rejection: After carefully reviewing your claim and verifying the flight data, we are currently unable to proceed with your compensation request. Based on our records, this specific flight does not show a qualifying disruption (such as a delay or cancellation) on that date. However, we want to ensure we have all the correct information. If you believe this assessment is inaccurate, or if you have any supporting documentation or evidence of a disruption (such as communication from the airline at the airport), we kindly request that you share it with us by replying to this email. We will be more than happy to review your documents and reassess your case accordingly.
    - jurisdiction expired Rejection : After a thorough review of your case, we regret to inform you that we are unable to move forward with your claim. Although your flight details were verified, the legal window to file for compensation—known as the statute of limitations—has officially closed under the applicable jurisdiction for this route.
    - disrupted and affected flights not under same booking Rejection : After carefully reviewing your claim, we regret to inform you that we are unable to proceed with your compensation request. Our records indicate that the initial disrupted flight and the subsequent missed connecting flight were booked under separate booking references. For a missed connection claim to be eligible under relevant aviation regulations, both flights must typically be part of a single booking or itinerary. Therefore, we cannot pursue compensation for the missed connection in this instance.
    (Include the Custom Request as a bullet point if one is provided, and explicitly instruct them how to fulfill it).
    - in the custom request always refine it and make it professional and easy to understand

    ${baseTemplate}

    OUTPUT REQUIREMENTS:
    1. Translate the above template and the filled bullet points/rejection texts perfectly into ${language}.
    2. Do not include introductory conversational text.
    3. Keep the spacing and line breaks identical to the template.
    ${language !== 'English' ? `4. CRITICAL: After the ${language} translation, add EXACTLY the string "|||ENGLISH|||" on a new line, and then print the exact English version below it so the backend can parse it.` : ''}
  `;

  const result = await model.generateContent(prompt);
  let resultText = result.response.text().trim();

  let emailText   = resultText;
  let englishText = null;

  if (language !== 'English' && resultText.includes('|||ENGLISH|||')) {
    const parts = resultText.split('|||ENGLISH|||');
    emailText   = parts[0].trim();
    englishText = parts[1] ? parts[1].trim() : null;
  }

  res.status(200).json({ success: true, email: emailText, englishTranslation: englishText });
});

// ---------------------------------------------------------------------------
// EOC SYNC
// ---------------------------------------------------------------------------

exports.syncEOC = async (req, res) => {
  try {
    const previousCount = await EocRecord.countDocuments();
    console.log(`[syncEOC] Sync requested. Current count: ${previousCount}`);
    const { newCount, delta } = await syncEocFromSheet(previousCount);
    const deltaStr = delta > 0 ? `+${delta}` : String(delta);
    console.log(`[syncEOC] Done. New count: ${newCount} (${deltaStr})`);
    res.json({ success: true, newCount, delta, message: `Synced ${newCount} records, ${deltaStr} new` });
  } catch (error) {
    console.error('[syncEOC] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};