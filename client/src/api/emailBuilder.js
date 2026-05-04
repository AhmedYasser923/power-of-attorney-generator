const parseJsonResponse = async (response) => {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || payload.error || 'Request failed. Please try again.');
  }

  return payload;
};

export const getEmailTemplates = async ({ signal } = {}) => {
  const response = await fetch('/api/tools/email-templates', {
    credentials: 'same-origin',
    signal
  });

  return parseJsonResponse(response);
};

export const generateEmail = async ({ payload, signal }) => {
  const response = await fetch('/api/generate-email', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal
  });

  return parseJsonResponse(response);
};

export const saveEmailTemplate = async ({ template, isNew, signal }) => {
  const response = await fetch('/api/tools/email-templates', {
    method: isNew ? 'POST' : 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(template),
    signal
  });

  return parseJsonResponse(response);
};

export const deleteEmailTemplate = async ({ key, signal }) => {
  const response = await fetch('/api/tools/email-templates', {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
    signal
  });

  return parseJsonResponse(response);
};
