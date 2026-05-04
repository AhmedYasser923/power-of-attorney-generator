const parseResponse = async (response) => {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || 'Request failed. Please try again.');
  }

  return payload;
};

const request = async (url, options = {}) => {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  return parseResponse(response);
};

const buildUsageQuery = ({ year, month, day, page, limit }) => {
  const params = new URLSearchParams();

  if (year) params.set('year', year);
  if (month) params.set('month', month);
  if (day) params.set('day', day);
  if (page) params.set('page', page);
  if (limit) params.set('limit', limit);

  return params.toString();
};

export const getUsageBreakdown = ({ year, month }) =>
  request(`/api/me/usage?${buildUsageQuery({ year, month })}`);

export const getUsageLogs = ({ year, month, day = 0, page = 1, limit = 5 }) =>
  request(`/api/me/logs?${buildUsageQuery({ year, month, day, page, limit })}`);
