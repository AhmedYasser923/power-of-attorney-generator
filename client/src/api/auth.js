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
