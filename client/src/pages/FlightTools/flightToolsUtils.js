import { buildTrackerURLs, hasFullDate } from '../TicketAnalyzer/ticketAnalyzerUtils.js';

const MONTH_LOOKUP = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12
};

function makeIsoDate(year, month, day) {
  const y = Number.parseInt(year, 10);
  const m = Number.parseInt(month, 10);
  const d = Number.parseInt(day, 10);

  if (!y || !m || !d) return '';

  const candidate = new Date(y, m - 1, d);
  if (
    candidate.getFullYear() !== y ||
    candidate.getMonth() !== m - 1 ||
    candidate.getDate() !== d
  ) {
    return '';
  }

  return [
    String(y).padStart(4, '0'),
    String(m).padStart(2, '0'),
    String(d).padStart(2, '0')
  ].join('-');
}

export function parseDateFromDisplay(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return makeIsoDate(iso[1], iso[2], iso[3]);

  const dayFirst = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dayFirst) return makeIsoDate(dayFirst[3], dayFirst[2], dayFirst[1]);

  const dayMonthName = text.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s+(\d{4})$/i);
  if (dayMonthName) {
    const month = MONTH_LOOKUP[dayMonthName[2].toLowerCase()];
    if (month) return makeIsoDate(dayMonthName[3], month, dayMonthName[1]);
  }

  const monthNameDay = text.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i);
  if (monthNameDay) {
    const month = MONTH_LOOKUP[monthNameDay[1].toLowerCase()];
    if (month) return makeIsoDate(monthNameDay[3], month, monthNameDay[2]);
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';

  return makeIsoDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

export function parseFlightNumber(value) {
  const match = String(value || '').trim().match(/^([A-Za-z]{3}|[A-Za-z0-9]{2})\s*(\d{1,4})$/);
  if (!match) return null;

  return {
    airline: match[1].toUpperCase(),
    rawNumber: match[2],
    cleanNumber: String(Number.parseInt(match[2], 10)),
    display: `${match[1].toUpperCase()}${match[2]}`
  };
}

export function getFlightSearchData(flightNumber, date) {
  const flight = parseFlightNumber(flightNumber);
  if (!flight) {
    return { error: 'Enter a valid flight number, for example BA0123 or U28412.' };
  }

  if (!hasFullDate(date)) {
    return { error: 'Enter a valid travel date.' };
  }

  const urls = buildTrackerURLs(flight.display, date);
  if (!urls?.airportInfo) {
    return { error: 'Unable to build tracker links for this flight.' };
  }

  return { flight, urls };
}
