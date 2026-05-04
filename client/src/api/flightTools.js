const parseJsonResponse = async (response) => {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || payload.error || 'Request failed. Please try again.');
  }

  return payload;
};

export const getToolsFlightStatus = async ({ flightNumber, date, signal }) => {
  const params = new URLSearchParams({
    flightNumber: flightNumber || '',
    date: date || ''
  });

  const response = await fetch(`/api/tools/flight-status?${params.toString()}`, {
    credentials: 'same-origin',
    signal
  });

  return parseJsonResponse(response);
};
