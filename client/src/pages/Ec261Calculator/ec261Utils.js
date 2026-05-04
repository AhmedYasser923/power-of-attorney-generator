export const EC261_COUNTRIES = [
  'austria',
  'belgium',
  'bulgaria',
  'croatia',
  'cyprus',
  'czech republic',
  'denmark',
  'estonia',
  'finland',
  'france',
  'germany',
  'greece',
  'hungary',
  'ireland',
  'italy',
  'latvia',
  'lithuania',
  'luxembourg',
  'malta',
  'netherlands',
  'the netherlands',
  'poland',
  'portugal',
  'romania',
  'slovakia',
  'slovenia',
  'spain',
  'sweden',
  'iceland',
  'norway',
  'switzerland',
  'united kingdom',
  'uk',
  'guadeloupe',
  'reunion',
  'martinique',
  'french guiana',
  'mayotte'
];

export function normalizeCountry(country) {
  return String(country || '').trim().toLowerCase();
}

export function isEc261Country(country) {
  return EC261_COUNTRIES.includes(normalizeCountry(country));
}

export function calculateDistanceKm(origin, destination) {
  const lat1 = Number.parseFloat(origin.lat);
  const lon1 = Number.parseFloat(origin.lon);
  const lat2 = Number.parseFloat(destination.lat);
  const lon2 = Number.parseFloat(destination.lon);

  if (
    Number.isNaN(lat1) ||
    Number.isNaN(lon1) ||
    Number.isNaN(lat2) ||
    Number.isNaN(lon2) ||
    (lat1 === 0 && lon1 === 0)
  ) {
    return null;
  }

  const radius = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  return Math.round(radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function getCompensation({ distanceKm, originCountry, destinationCountry }) {
  const isOriginEu = isEc261Country(originCountry);
  const isDestinationEu = isEc261Country(destinationCountry);

  if (distanceKm > 1500 && distanceKm <= 3500) {
    return { amount: 'EUR 400', band: 'Medium Haul' };
  }

  if (distanceKm > 3500) {
    if (isOriginEu && isDestinationEu) {
      return { amount: 'EUR 400', band: 'Intra-EU Long Haul (Capped)' };
    }

    return { amount: 'EUR 600', band: 'Long Haul' };
  }

  return { amount: 'EUR 250', band: 'Short Haul' };
}
