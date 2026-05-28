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

export const checkEoc = async ({ date, originIata, destIata, originCountry, destCountry, signal }) => {
  const params = new URLSearchParams({
    date: date || '',
    originIata: originIata || '',
    destIata: destIata || '',
    originCountry: originCountry || '',
    destCountry: destCountry || ''
  });

  const response = await fetch(`/api/tools/check-eoc?${params.toString()}`, {
    credentials: 'same-origin',
    signal
  });

  return parseJsonResponse(response);
};

export const listEocRecords = async ({ cursor, limit = 40, signal } = {}) => {
  const params = new URLSearchParams({
    limit: String(limit)
  });

  if (cursor) params.set('cursor', cursor);

  const response = await fetch(`/api/tools/eoc-records?${params.toString()}`, {
    credentials: 'same-origin',
    signal
  });

  return parseJsonResponse(response);
};

export const syncEoc = async ({ signal } = {}) => {
  const response = await fetch('/api/tools/sync-eoc', {
    method: 'POST',
    credentials: 'same-origin',
    signal
  });

  return parseJsonResponse(response);
};

const buildOverridePayload = ({ event, endDate, note }) => ({
  category: event?.category || '',
  startDate: event?.startDate || event?.date || '',
  location: event?.location || '',
  event: event?.event || '',
  decision: event?.decision || '',
  endDate: endDate || '',
  note: note || ''
});

export const closeOngoingEoc = async ({ event, endDate, note, signal }) => {
  const response = await fetch('/api/tools/eoc-ongoing-override', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildOverridePayload({ event, endDate, note })),
    signal
  });

  return parseJsonResponse(response);
};

export const reopenOngoingEoc = async ({ event, note, signal }) => {
  const response = await fetch('/api/tools/eoc-ongoing-override', {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildOverridePayload({ event, note })),
    signal
  });

  return parseJsonResponse(response);
};
