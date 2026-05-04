const parseJsonResponse = async (response) => {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || payload.error || 'Request failed. Please try again.');
  }

  return payload;
};

export const analyzeTicketFiles = async ({ files, journeyYear, signal }) => {
  const body = new FormData();

  files.forEach((file) => {
    body.append('ticket', file);
  });

  if (journeyYear) {
    body.append('journeyYear', journeyYear);
  }

  const response = await fetch('/api/analyze-ticket', {
    method: 'POST',
    credentials: 'same-origin',
    body,
    signal
  });

  return parseJsonResponse(response);
};

export const checkEoc = async ({ date, originIata, destIata, originCountry, destCountry }) => {
  const params = new URLSearchParams({
    date: date || '',
    originIata: originIata || '',
    destIata: destIata || '',
    originCountry: originCountry || '',
    destCountry: destCountry || ''
  });

  const response = await fetch(`/api/check-eoc?${params.toString()}`, {
    credentials: 'same-origin'
  });

  return parseJsonResponse(response);
};

export const checkFlightStatus = async ({ flightNumber, date, origin, destination }) => {
  const params = new URLSearchParams({
    flightNumber: flightNumber || '',
    date: date || '',
    origin: origin || '',
    destination: destination || ''
  });

  const response = await fetch(`/api/flight-status?${params.toString()}`, {
    credentials: 'same-origin'
  });

  return parseJsonResponse(response);
};
