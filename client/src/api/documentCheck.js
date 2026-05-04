const parseJsonResponse = async (response) => {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || payload.error || 'Request failed. Please try again.');
  }

  return payload;
};

export const searchAirlines = async ({ query, signal }) => {
  if (!query || query.trim().length < 2) return [];

  const params = new URLSearchParams({ q: query.trim() });
  const response = await fetch(`/api/tools/search-airlines?${params.toString()}`, {
    credentials: 'same-origin',
    signal
  });

  return parseJsonResponse(response);
};

export const checkDocuments = async ({ airline, signal }) => {
  const params = new URLSearchParams({ airline: airline || '' });
  const response = await fetch(`/api/tools/check-docs?${params.toString()}`, {
    credentials: 'same-origin',
    signal
  });

  return parseJsonResponse(response);
};
