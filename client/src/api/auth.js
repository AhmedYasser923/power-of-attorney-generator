let onSessionExpired = null;

export const setSessionExpiredHandler = (handler) => {
  onSessionExpired = handler;
};

const AUTH_ENTRY_ENDPOINTS = new Set(['/api/auth/login', '/api/auth/signup']);

const parseResponse = async (response, url) => {
  const payload = await response.json().catch(() => ({}));

  if (response.status === 401 && onSessionExpired && !AUTH_ENTRY_ENDPOINTS.has(url)) {
    onSessionExpired();
    throw new Error('Session expired');
  }

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

  return parseResponse(response, url);
};

export const apiLogin = (credentials) =>
  request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials)
  });

export const apiSignup = (account) =>
  request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(account)
  });

export const apiGetMe = () => request('/api/auth/me');

export const apiLogout = () =>
  request('/api/auth/logout', { method: 'POST' });
