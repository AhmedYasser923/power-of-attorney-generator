const parseJsonResponse = async (response) => {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || payload.error || 'Request failed. Please try again.');
  }

  return payload;
};

export const searchAirports = async ({ query, signal }) => {
  if (!query || query.trim().length < 2) return [];

  const params = new URLSearchParams({ q: query.trim() });
  const response = await fetch(`/api/tools/search-airports?${params.toString()}`, {
    credentials: 'same-origin',
    signal
  });

  return parseJsonResponse(response);
};

export function logEc261Calc({ origin, destination, distanceKm, compensation, band }) {
  return fetch('/api/tools/log-ec261-calc', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin, destination, distanceKm, compensation, band })
  }).catch(() => {});
}
