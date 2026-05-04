import { JURISDICTION_LIMITS } from '../Jurisdiction/jurisdictionData.js';

export function getJurisdictionSuffix(country) {
  const key = String(country || '').toLowerCase().trim();
  const limit = JURISDICTION_LIMITS[key];

  if (limit === undefined) return '';
  if (typeof limit === 'number') return ` - ${limit} yrs`;

  return ` - ${limit}`;
}

export function isExactAirlineMatch(airline, query) {
  const value = String(query || '').trim().toLowerCase();
  if (!value) return false;

  return (
    airline.name?.toLowerCase() === value ||
    (airline.iata && airline.iata.toLowerCase() !== 'na' && airline.iata.toLowerCase() === value)
  );
}
