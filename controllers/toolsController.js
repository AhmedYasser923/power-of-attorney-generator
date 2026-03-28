const eocDatabase = require('../eoc_data.json');
const airportsDatabase = require('../airports_data.json');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Render the UI
exports.renderTools = catchAsync(async (req, res, next) => {
  res.render('tools', { title: 'Tools Suite' });
});

// Isolated EOC Checker
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

    res.json({ eocFound: matchedEvents.length > 0, events: matchedEvents });
  } catch (error) {
    next(error);
  }
};

// Isolated Airport Search
exports.searchAirports = (req, res, next) => {
  try {
    const q = (req.query.q || '').trim().toLowerCase();
    if (!q || q.length < 2) return res.json([]);

    const exactMatches = [];
    const startsWithMatches = [];
    const includesMatches = [];

    airportsDatabase.forEach(a => {
      const iata = (a.iata || '').toLowerCase();
      const city = (a.city || '').toLowerCase();
      const name = (a.name || '').toLowerCase();

      if (iata === q) exactMatches.push(a);
      else if (iata.startsWith(q) || city.startsWith(q)) startsWithMatches.push(a);
      else if (iata.includes(q) || city.includes(q) || name.includes(q)) includesMatches.push(a);
    });

    res.json([...exactMatches, ...startsWithMatches, ...includesMatches].slice(0, 8));
  } catch (error) {
    next(error);
  }
};

// Isolated OAG Flight Status Checker
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
