const MISSING_DATE_VALUES = new Set([
  '',
  'unknown',
  'not provided',
  'n/a',
  'not available',
  'none',
  'null'
]);

const TRACKER_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MONTH_LOOKUP = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12'
};

const VALID_PNR_MISSING = new Set(['not provided', 'unknown']);

export function normalizeJourneys(raw) {
  const payload = raw?.journeys || raw;

  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  return [payload];
}

export function classifyDate(raw) {
  const value = String(raw || '').trim();

  if (MISSING_DATE_VALUES.has(value.toLowerCase())) return 'missing';
  if (/\d{4}/.test(value)) return 'full';

  return 'partial';
}

export function hasFullDate(raw) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(raw || '').trim());
}

export function buildFullDate(partial, year) {
  const value = String(partial || '').trim();
  const y = String(year || '').trim();

  if (!value || !/^\d{4}$/.test(y)) return null;
  if (hasFullDate(value)) return value;

  const dayMonth = value.match(/^(\d{1,2})\s+([A-Za-z]+)$/);
  if (dayMonth && MONTH_LOOKUP[dayMonth[2].toLowerCase()]) {
    return `${y}-${MONTH_LOOKUP[dayMonth[2].toLowerCase()]}-${dayMonth[1].padStart(2, '0')}`;
  }

  const monthDay = value.match(/^([A-Za-z]+)\s+(\d{1,2})$/);
  if (monthDay && MONTH_LOOKUP[monthDay[1].toLowerCase()]) {
    return `${y}-${MONTH_LOOKUP[monthDay[1].toLowerCase()]}-${monthDay[2].padStart(2, '0')}`;
  }

  const parsed = new Date(`${value} ${y}`);
  if (Number.isNaN(parsed.getTime())) return null;

  return `${y}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

export function normalizeStatus(raw) {
  return String(raw || '').trim().toLowerCase();
}

export function getStatusBadge(flight) {
  const status = normalizeStatus(flight.flightStatus);

  if (status === 'cancelled') {
    return { label: 'Flight cancelled by airline', tone: 'danger', opacity: 0.55 };
  }

  if (status === 'unused / missed connection') {
    return { label: 'Missed connection / unused ticket', tone: 'neutral', opacity: 0.65 };
  }

  if (status === 'replacement flight') {
    return { label: 'Replacement flight', tone: 'info', opacity: 1 };
  }

  if (status === 'unused replacement flight') {
    return { label: 'Unused replacement flight', tone: 'info', opacity: 0.65 };
  }

  if (status === 'rescheduled') {
    return { label: 'Rescheduled - time change', tone: 'warning', opacity: 1 };
  }

  return null;
}

export function isRescheduled(flight) {
  return normalizeStatus(flight.flightStatus) === 'rescheduled';
}

export function getFlightNumbers(flight) {
  if (!Array.isArray(flight.flightNumbers)) return [];

  return flight.flightNumbers
    .map((flightNumber) => String(flightNumber || '').trim())
    .filter((flightNumber) => flightNumber && flightNumber !== 'N/A' && flightNumber !== 'Unknown');
}

export function buildTrackerURLs(flightNumber, date) {
  const match = String(flightNumber || '').trim().match(/^([A-Za-z]{3}|[A-Za-z0-9]{2})\s*(\d{1,4})$/);

  if (!match) return null;

  const airline = match[1].toUpperCase();
  const rawNumber = match[2];
  const cleanNumber = String(Number.parseInt(rawNumber, 10));

  if (!hasFullDate(date)) {
    return { airportInfo: null, flightStats: null, flightera: null };
  }

  const [year, month, day] = date.split('-');

  return {
    airportInfo: `https://airportinfo.live/flight/${(airline + rawNumber).toLowerCase()}?d=${date}`,
    flightStats: `https://www.flightstats.com/v2/historical-flight/${airline}/${cleanNumber}/${year}/${Number.parseInt(month, 10)}/${Number.parseInt(day, 10)}`,
    flightera: `https://www.flightera.net/en/flight/${airline}${cleanNumber}/${TRACKER_MONTHS[Number.parseInt(month, 10) - 1]}-${year}#flight_list`
  };
}

export function assignPnrColors(journeys) {
  const uniquePnrs = new Set();

  journeys.forEach((journey) => {
    (journey.routes || []).forEach((route) => {
      (route.legs || []).forEach((leg) => {
        const pnr = String(leg.pnr || '').trim();
        if (pnr && !VALID_PNR_MISSING.has(pnr.toLowerCase())) {
          uniquePnrs.add(pnr.toUpperCase());
        }
      });
    });
  });

  return Array.from(uniquePnrs).sort().reduce((map, pnr, index) => ({
    ...map,
    [pnr]: (index % 6) + 1
  }), {});
}

export function getPnrDiagnostics(journeys) {
  let hasMissingPnr = false;
  const uniquePnrs = new Set();

  journeys.forEach((journey) => {
    (journey.routes || []).forEach((route) => {
      (route.legs || []).forEach((leg) => {
        const pnr = String(leg.pnr || '').trim();
        const lowerPnr = pnr.toLowerCase();

        if (!pnr || VALID_PNR_MISSING.has(lowerPnr) || lowerPnr.includes('scan')) {
          hasMissingPnr = true;
        } else {
          uniquePnrs.add(pnr.toUpperCase());
        }
      });
    });
  });

  return {
    hasMissingPnr,
    differentPnrCount: hasMissingPnr ? 0 : uniquePnrs.size
  };
}

export function hasPartialDates(journeys) {
  return journeys.some((journey) =>
    (journey.routes || []).some((route) =>
      (route.legs || []).some((leg) => classifyDate(leg.date) === 'partial')
    )
  );
}

export function getPnrColorClass(pnr, pnrColorMap) {
  const key = String(pnr || '').trim().toUpperCase();
  const color = pnrColorMap[key];

  return color ? `ta-pnr-badge-${color}` : '';
}

export function getExpirationState(flight, date) {
  const exp = flight.ec261Leg?.claimExpiration;

  if (!exp) return { label: 'Expiration unavailable', tone: 'neutral', expired: false };

  const bestYears = exp.bestYears ?? 'N/A';
  const bestCountry = exp.bestCountry ?? 'N/A';
  const parsedYears = Number.parseInt(bestYears, 10);

  if (classifyDate(date) === 'missing') {
    return { label: 'Set date to verify expiry', tone: 'warning', expired: false };
  }

  if (classifyDate(date) === 'partial') {
    return { label: 'Enter year to verify expiry', tone: 'warning', expired: false };
  }

  if (Number.isNaN(parsedYears)) {
    return { label: 'Jurisdiction limit unknown', tone: 'neutral', expired: false };
  }

  const flightDate = new Date(date);
  if (Number.isNaN(flightDate.getTime())) {
    return { label: 'Cannot calculate expiry', tone: 'warning', expired: false };
  }

  const expirationDate = new Date(flightDate);
  expirationDate.setFullYear(expirationDate.getFullYear() + parsedYears);
  const expirationIso = expirationDate.toISOString().split('T')[0];
  const expired = new Date() > expirationDate;

  return {
    label: expired ? 'Claim expired' : `Valid to ${expirationIso}`,
    title: expired
      ? `Deadline was ${expirationIso} (${bestCountry})`
      : `Valid under ${bestCountry} law (${parsedYears} years)`,
    tone: expired ? 'danger' : 'neutral',
    expired
  };
}

export function formatLimit(value) {
  const text = String(value || '').trim();

  if (!text || text === 'N/A' || text.toLowerCase().includes('not applicable')) return 'N/A';
  if (text.toLowerCase().includes('year')) return text;

  return `${text} years`;
}

export function getClaimValueBadge(flight) {
  const value = flight.ec261Leg?.estimatedClaimValue;

  if (!value || value === 'N/A') return null;

  return value;
}

export function getCardId({ journeyIndex, routeIndex, legIndex, flight }) {
  const flightNumber = getFlightNumbers(flight)[0] || 'flight';
  const origin = flight.originIata || 'origin';
  const destination = flight.destinationIata || 'destination';

  return `${journeyIndex}-${routeIndex}-${legIndex}-${flightNumber}-${origin}-${destination}`;
}

export function openTrackerUrls(items, tracker) {
  let skipped = 0;

  items.forEach((item) => {
    item.flightNumbers.forEach((flightNumber) => {
      const urls = buildTrackerURLs(flightNumber, item.date);

      if (!urls?.airportInfo) {
        skipped += 1;
        return;
      }

      if (tracker === 'all' || tracker === 'airportinfo') window.open(urls.airportInfo, '_blank', 'noopener');
      if (tracker === 'all' || tracker === 'flightstats') window.open(urls.flightStats, '_blank', 'noopener');
      if (tracker === 'all' || tracker === 'flightera') window.open(urls.flightera, '_blank', 'noopener');
    });
  });

  return skipped;
}
