export const JURISDICTION_LIMITS = {
  poland: 1,
  belgium: 5,
  italy: 2,
  netherlands: 2,
  'the netherlands': 2,
  switzerland: 2,
  croatia: 3,
  iceland: 2,
  slovakia: 2,
  slovenia: 2,
  germany: 3,
  austria: 3,
  denmark: 3,
  finland: 3,
  norway: 3,
  portugal: 2,
  romania: 3,
  bulgaria: 1,
  estonia: 3,
  latvia: 1,
  lithuania: 3,
  spain: 5,
  france: 5,
  greece: 5,
  hungary: 2,
  uk: 6,
  'united kingdom': 6,
  ireland: 6,
  cyprus: 6,
  luxembourg: 10,
  sweden: '2 Months - 10',
  'czech republic': '6 Months - 3',
  malta: 'No Limit'
};

export function normalizeCountry(value) {
  return String(value || '').toLowerCase().trim();
}

export function formatCountry(country) {
  return String(country || '')
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatLimit(limit) {
  return typeof limit === 'number' ? `${limit} years` : limit;
}

export function getCountryMatches(query) {
  const value = normalizeCountry(query);
  if (!value) return [];

  return Object.keys(JURISDICTION_LIMITS)
    .filter((country) => country.includes(value) && country !== value)
    .sort();
}
