import { buildTrackerURLs, hasFullDate } from '../TicketAnalyzer/ticketAnalyzerUtils.js';
export { parseDateFromDisplay } from '../../utils/dateUtils.js';

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
