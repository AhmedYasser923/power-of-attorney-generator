const parseResponse = async (response) => {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.status === 'fail' || payload.status === 'error') {
    throw new Error(payload.message || payload.error || 'Request failed. Please try again.');
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

const buildQuery = ({ year, month, day, page, limit }) => {
  const params = new URLSearchParams();

  if (year) params.set('year', year);
  if (month) params.set('month', month);
  if (day) params.set('day', day);
  if (page) params.set('page', page);
  if (limit) params.set('limit', limit);

  return params.toString();
};

export const getAdminUsers = () => request('/admin/users');

export const getAdminUsage = ({ year, month }) =>
  request(`/admin/usage?${buildQuery({ year, month })}`);

export const getAdminLogs = ({ year, month, day = 0, page = 1, limit = 5 }) =>
  request(`/admin/logs?${buildQuery({ year, month, day, page, limit })}`);

export const updateUserStatus = ({ id, action }) => {
  const endpoints = {
    approve: `/admin/users/${id}/approve`,
    reject: `/admin/users/${id}/suspend`,
    suspend: `/admin/users/${id}/suspend`,
    resume: `/admin/users/${id}/resume`
  };

  return request(endpoints[action], { method: 'PATCH' });
};

export const changeUserPassword = ({ id, password }) =>
  request(`/admin/users/${id}/password`, {
    method: 'PATCH',
    body: JSON.stringify({ password })
  });

export const reloadClients = () =>
  request('/admin/reload-clients', { method: 'POST' });
