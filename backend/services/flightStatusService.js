'use strict';

async function getFlightStatus({ flightNumber, date, origin, destination }) {
  try {
    if (!flightNumber || flightNumber === 'N/A')
      return { error: 'Valid flight number is required' };

    const ciriumAppId  = process.env.CIRIUM_APP_ID;
    const ciriumAppKey = process.env.CIRIUM_APP_KEY;
    if (!ciriumAppId || !ciriumAppKey) {
      console.error('[Cirium] Error: CIRIUM_APP_ID or CIRIUM_APP_KEY Missing in config.env!');
      return { error: 'Cirium API Credentials Missing. Check .env file.' };
    }

    const match = flightNumber.match(/([A-Za-z]{3}|[A-Za-z0-9]{2})\s*0*(\d{1,4})/);
    if (!match)
      return { error: `Invalid flight format (${flightNumber}). Expected format like 'LH458', 'VS207', or 'U28412'.` };

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

    if (data.error) return { error: data.error.errorMessage || 'Cirium API Error' };
    if (!data.flightStatuses || data.flightStatuses.length === 0)
      return { error: `No flight data found in Cirium for ${carrier}${fNum} on ${date}.` };

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

    return {
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
    };
  } catch (error) {
    console.error('Flight Status Crash:', error);
    return { error: error.message || 'An unexpected server error occurred.' };
  }
}

module.exports = { getFlightStatus };
