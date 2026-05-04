const parseJsonResponse = async (response) => {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || payload.error || 'Request failed. Please try again.');
  }

  return payload;
};

export const lookupIata = async ({ query, signal }) => {
  if (!query || query.trim().length < 2) return [];

  const params = new URLSearchParams({ q: query.trim().toLowerCase() });
  const response = await fetch(`/api/tools/lookup-iata?${params.toString()}`, {
    credentials: 'same-origin',
    signal
  });

  return parseJsonResponse(response);
};
