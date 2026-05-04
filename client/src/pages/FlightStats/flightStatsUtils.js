import { parseDateFromDisplay } from '../../utils/dateUtils.js';
import { hasFullDate } from '../TicketAnalyzer/ticketAnalyzerUtils.js';

export { parseDateFromDisplay, hasFullDate };

export function parseFlightNumber(value) {
  const match = String(value || '').trim().match(/^([A-Za-z]{3}|[A-Za-z0-9]{2})\s*(\d{1,4})$/);
  if (!match) return null;

  return {
    airline: match[1].toUpperCase(),
    number: match[2],
    display: `${match[1].toUpperCase()}${match[2]}`
  };
}

export function getFlightStatsSearchData(flightNumber, date) {
  const flight = parseFlightNumber(flightNumber);
  if (!flight) {
    return { error: 'Enter a valid flight number, for example BA0123 or U28412.' };
  }

  if (!hasFullDate(date)) {
    return { error: 'Enter a valid flight date.' };
  }

  return { flight };
}
