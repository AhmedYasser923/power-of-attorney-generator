const parseJsonResponse = async (response) => {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || payload.error || 'Request failed. Please try again.');
  }

  return payload;
};

export const listAnnouncements = async ({ signal } = {}) => {
  const response = await fetch('/api/tools/announcements', {
    credentials: 'same-origin',
    signal
  });

  return parseJsonResponse(response);
};

export const askAnnouncements = async ({ question, signal }) => {
  const response = await fetch('/api/tools/announcements/ask', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
    signal
  });

  return parseJsonResponse(response);
};

export const createAnnouncement = async ({ announcer, date, subject, content, signal }) => {
  const response = await fetch('/api/tools/announcements', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ announcer, date, subject, content }),
    signal
  });

  return parseJsonResponse(response);
};

export const deleteAnnouncement = async ({ id, signal }) => {
  const response = await fetch(`/api/tools/announcements/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
    signal
  });

  return parseJsonResponse(response);
};
