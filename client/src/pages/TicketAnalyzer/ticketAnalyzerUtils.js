import { getTrackerOverrides } from '../../api/trackerOverrides.js';

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
  fev: '02',
  fevr: '02',
  fevrier: '02',
  mar: '03',
  march: '03',
  mars: '03',
  apr: '04',
  april: '04',
  avr: '04',
  avril: '04',
  may: '05',
  mai: '05',
  jun: '06',
  june: '06',
  juin: '06',
  jul: '07',
  july: '07',
  juil: '07',
  juillet: '07',
  aug: '08',
  august: '08',
  aout: '08',
  sep: '09',
  sept: '09',
  september: '09',
  septembre: '09',
  oct: '10',
  october: '10',
  octobre: '10',
  nov: '11',
  november: '11',
  novembre: '11',
  dec: '12',
  december: '12',
  decembre: '12'
};

const MONTH_TOKEN_RE = '([\\p{L}.]+)';
const DATE_PART_SEPARATOR_RE = '[\\s/.-]+';

function normalizeMonthName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '');
}

function lookupMonth(value) {
  return MONTH_LOOKUP[normalizeMonthName(value)];
}

const VALID_PNR_MISSING = new Set(['not provided', 'unknown']);

export function normalizeJourneys(raw) {
  const payload = raw?.journeys || raw;

  if (!payload) return [];
  if (Array.isArray(payload)) return normalizeJourneyDates(payload);

  return normalizeJourneyDates([payload]);
}

export function classifyDate(raw) {
  const value = String(raw || '').trim();

  if (MISSING_DATE_VALUES.has(value.toLowerCase())) return 'missing';
  if (hasFullDate(value) || normalizeDateToIso(value)) return 'full';

  return 'partial';
}

export function hasFullDate(raw) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(raw || '').trim());
}

function makeIsoDate(year, month, day) {
  const y = Number.parseInt(year, 10);
  const m = Number.parseInt(month, 10);
  const d = Number.parseInt(day, 10);

  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1) return null;

  const candidate = new Date(Date.UTC(y, m - 1, d));
  if (
    candidate.getUTCFullYear() !== y ||
    candidate.getUTCMonth() !== m - 1 ||
    candidate.getUTCDate() !== d
  ) {
    return null;
  }

  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function getDateParts(raw) {
  const value = String(raw || '').trim().replace(/,/g, ' ').replace(/\s+/g, ' ');
  if (!value || MISSING_DATE_VALUES.has(value.toLowerCase())) return null;

  let match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  if (match) {
    return {
      year: Number.parseInt(match[1], 10),
      month: Number.parseInt(match[2], 10),
      day: Number.parseInt(match[3], 10)
    };
  }

  match = value.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (match) {
    return {
      year: Number.parseInt(match[1], 10),
      month: Number.parseInt(match[2], 10),
      day: Number.parseInt(match[3], 10)
    };
  }

  match = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (match) {
    return {
      year: Number.parseInt(match[3], 10),
      month: Number.parseInt(match[2], 10),
      day: Number.parseInt(match[1], 10)
    };
  }

  const dayMonth = value.match(new RegExp(`^(\\d{1,2})${DATE_PART_SEPARATOR_RE}${MONTH_TOKEN_RE}(?:${DATE_PART_SEPARATOR_RE}(\\d{4}))?$`, 'u'));
  const dayMonthValue = dayMonth ? lookupMonth(dayMonth[2]) : null;
  if (dayMonthValue) {
    return {
      year: dayMonth[3] ? Number.parseInt(dayMonth[3], 10) : null,
      month: Number.parseInt(dayMonthValue, 10),
      day: Number.parseInt(dayMonth[1], 10)
    };
  }

  const monthDay = value.match(new RegExp(`^${MONTH_TOKEN_RE}${DATE_PART_SEPARATOR_RE}(\\d{1,2})(?:${DATE_PART_SEPARATOR_RE}(\\d{4}))?$`, 'u'));
  const monthDayValue = monthDay ? lookupMonth(monthDay[1]) : null;
  if (monthDayValue) {
    return {
      year: monthDay[3] ? Number.parseInt(monthDay[3], 10) : null,
      month: Number.parseInt(monthDayValue, 10),
      day: Number.parseInt(monthDay[2], 10)
    };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return {
    year: null,
    month: parsed.getMonth() + 1,
    day: parsed.getDate()
  };
}

function getMonthDayParts(raw) {
  const parts = getDateParts(raw);
  if (!parts) return null;

  return parts;
}

export function normalizeDateToIso(raw, fallbackYear = null) {
  const parts = getDateParts(raw);
  if (!parts) return null;

  const resolvedYear = parts.year || fallbackYear;
  if (!resolvedYear) return null;

  return makeIsoDate(resolvedYear, parts.month, parts.day);
}

function normalizeJourneyDates(journeys) {
  return journeys.map((journey) => ({
    ...journey,
    routes: (journey.routes || []).map((route) => ({
      ...route,
      legs: (route.legs || []).map((leg) => {
        const dateIso = normalizeDateToIso(leg.date);
        const rawIso = normalizeDateToIso(leg.rawExtractedDate);
        const iso = dateIso || rawIso;

        if (!iso) return leg;

        const source = String(leg.dateYearSource || '').trim();
        const next = { ...leg, date: iso };
        if (!source || source === 'unresolved') {
          next.dateYearSource = 'document';
          next.dateYearApplied = iso.slice(0, 4);
        }

        return next;
      })
    }))
  }));
}

export function buildFullDate(partial, year) {
  const value = String(partial || '').trim();
  const y = String(year || '').trim();

  if (!value || !/^\d{4}$/.test(y)) return null;
  if (hasFullDate(value)) return value;

  const normalized = normalizeDateToIso(value, y);
  if (normalized) return normalized;

  const parsed = new Date(`${value} ${y}`);
  if (Number.isNaN(parsed.getTime())) return null;

  return `${y}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

export function normalizeStatus(raw) {
  return String(raw || '').trim().toLowerCase();
}

export function formatMinutes(minutes) {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return '';
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h && m) return `${sign}${h}h ${m}m`;
  if (h) return `${sign}${h}h`;
  return `${sign}${m}m`;
}

function rescheduleLabel(change) {
  if (!change) return 'Rescheduled';
  const dateOnly = change.dateChanged && !change.timeChanged;
  const timeOnly = !change.dateChanged && change.timeChanged;
  if (dateOnly) return 'Rescheduled - date change';
  if (timeOnly) return 'Rescheduled - time change';
  if (change.dateChanged && change.timeChanged) return 'Rescheduled - date & time change';
  return 'Rescheduled';
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

  if (status === 'rescheduled' || flight.rescheduleChange) {
    return { label: rescheduleLabel(flight.rescheduleChange), tone: 'warning', opacity: 1 };
  }

  return null;
}

export function withAirportSuffix(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '';
  return /airport|aeropuerto|aéroport|aeroporto|flughafen/i.test(trimmed)
    ? trimmed
    : `${trimmed} Airport`;
}

export function silentCopy(text) {
  const value = String(text || '').trim();
  if (!value) return;
  try {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).catch(() => {});
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  } catch {
    // intentionally silent
  }
}

export function getDateYearSource(flight) {
  const source = String(flight?.dateYearSource || '').trim();
  const raw = String(flight?.rawExtractedDate || '');
  const normalized = String(flight?.date || '');
  const rawIso = normalizeDateToIso(raw);
  const normalizedIso = normalizeDateToIso(normalized);

  if (source && source !== 'unresolved') return source;
  if (rawIso || normalizedIso) return 'document';
  if (source) return source;
  return 'unresolved';
}

export function getDateSourceBadge(flight) {
  const source = getDateYearSource(flight);
  if (source === 'document') return { label: 'From document', tone: 'neutral' };
  if (source === 'document-propagated') return { label: 'From another document', tone: 'info' };
  if (source === 'user-input') return { label: 'From year input', tone: 'warning' };
  if (source === 'manual') return { label: 'Manually set', tone: 'neutral' };
  return { label: 'Year missing', tone: 'danger' };
}

export function isRescheduled(flight) {
  if (flight?.rescheduleChange) return true;
  return normalizeStatus(flight?.flightStatus) === 'rescheduled';
}

export function getFlightNumbers(flight) {
  if (!Array.isArray(flight.flightNumbers)) return [];

  return flight.flightNumbers
    .map((flightNumber) => String(flightNumber || '').trim())
    .filter((flightNumber) => flightNumber && flightNumber !== 'N/A' && flightNumber !== 'Unknown');
}

export function buildTrackerURLs(flightNumber, date, overrideCodes) {
  const match = String(flightNumber || '').trim().match(/^([A-Za-z]{3}|[A-Za-z0-9]{2})\s*(\d{1,4})$/);

  if (!match) return null;

  const airline = match[1].toUpperCase();
  const rawNumber = match[2];
  const cleanNumber = String(Number.parseInt(rawNumber, 10));

  const isoDate = normalizeDateToIso(date);

  if (!isoDate) {
    return { airportInfo: null, flightStats: null, flightera: null };
  }

  const [year, month, day] = isoDate.split('-');
  const codes = overrideCodes || getTrackerOverrides()[airline]?.codes;
  const codeFor = (key) => (codes && codes[key]) || airline;
  const aiCode = codeFor('airportInfo');
  const fsCode = codeFor('flightStats');
  const feCode = codeFor('flightera');

  return {
    airportInfo: `https://airportinfo.live/flight/${(aiCode + rawNumber).toLowerCase()}?d=${isoDate}`,
    flightStats: `https://www.flightstats.com/v2/historical-flight/${fsCode}/${cleanNumber}/${year}/${Number.parseInt(month, 10)}/${Number.parseInt(day, 10)}`,
    flightera: `https://www.flightera.net/en/flight/${feCode}${cleanNumber}/${TRACKER_MONTHS[Number.parseInt(month, 10) - 1]}-${year}#flight_list`
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
      (route.legs || []).some((leg) => leg.dateYearSource === 'unresolved' || classifyDate(leg.date) === 'partial')
    )
  );
}

function cloneJourneys(journeys) {
  return journeys.map((journey) => ({
    ...journey,
    passengers: Array.isArray(journey.passengers)
      ? journey.passengers.map((passenger) => ({ ...passenger }))
      : journey.passengers,
    routes: (journey.routes || []).map((route) => ({
      ...route,
      legs: (route.legs || []).map((leg) => ({ ...leg }))
    }))
  }));
}

function monthDayKey(parts) {
  return parts.month * 100 + parts.day;
}

function getLegMonthDay(leg) {
  return getMonthDayParts(leg.rawExtractedDate) || getMonthDayParts(leg.date);
}

export function applyYearToJourneys(journeys, year) {
  const y = String(year || '').trim();
  if (!/^\d{4}$/.test(y)) {
    return { journeys, changed: false, unresolved: hasPartialDates(journeys) };
  }

  const nextJourneys = cloneJourneys(journeys);
  const candidates = [];

  nextJourneys.forEach((journey, journeyIndex) => {
    (journey.routes || []).forEach((route, routeIndex) => {
      (route.legs || []).forEach((leg, legIndex) => {
        if (leg.dateYearSource !== 'unresolved' && classifyDate(leg.date) !== 'partial') return;

        const parts = getLegMonthDay(leg);
        candidates.push({ journeyIndex, routeIndex, legIndex, leg, parts });
      });
    });
  });

  let currentYear = Number.parseInt(y, 10);
  let previousParts = null;
  let changed = false;

  candidates.forEach((candidate) => {
    if (!candidate.parts) return;
    if (previousParts && monthDayKey(candidate.parts) < monthDayKey(previousParts)) {
      currentYear += 1;
    }

    const resolvedYear = candidate.parts.year || currentYear;
    const fullDate = makeIsoDate(resolvedYear, candidate.parts.month, candidate.parts.day);
    if (!fullDate) return;

    candidate.leg.date = fullDate;
    candidate.leg.dateYearSource = candidate.parts.year ? 'document' : 'user-input';
    candidate.leg.dateYearApplied = String(resolvedYear);
    changed = true;
    currentYear = resolvedYear;
    previousParts = candidate.parts;
  });

  return {
    journeys: nextJourneys,
    changed,
    unresolved: hasPartialDates(nextJourneys)
  };
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

  const isoDate = normalizeDateToIso(date);
  const flightDate = isoDate ? new Date(`${isoDate}T00:00:00Z`) : new Date(date);
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
  const resolved = [];

  items.forEach((item) => {
    item.flightNumbers.forEach((flightNumber) => {
      const urls = buildTrackerURLs(flightNumber, item.date);

      if (!urls?.airportInfo) {
        skipped += 1;
        return;
      }

      resolved.push(urls);
    });
  });

  const trackers = tracker === 'all'
    ? ['airportinfo', 'flightstats', 'flightera']
    : [tracker];

  const keyMap = { airportinfo: 'airportInfo', flightstats: 'flightStats', flightera: 'flightera' };

  trackers.forEach((t) => {
    resolved.forEach((urls) => {
      window.open(urls[keyMap[t]], '_blank', 'noopener');
    });
  });

  return skipped;
}
