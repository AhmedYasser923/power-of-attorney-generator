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
  const response = await fetch('/api/tools/generate-email', {
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
  const response = await fetch(`/api/tools/email-templates/${encodeURIComponent(key)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
    signal
  });

  return parseJsonResponse(response);
};

export const translateEmail = async ({ text, language, signal }) => {
  const response = await fetch('/api/tools/translate-email', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language }),
    signal
  });

  return parseJsonResponse(response);
};

export const refineEmailSection = async ({ section, context, language, signal }) => {
  const response = await fetch('/api/tools/refine-email-section', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ section, context, language }),
    signal
  });

  return parseJsonResponse(response);
};

export const getEmailReferences = async ({ signal } = {}) => {
  const response = await fetch('/api/tools/email-references', {
    credentials: 'same-origin',
    signal
  });

  return parseJsonResponse(response);
};

export const saveEmailReference = async ({ title, content, signal }) => {
  const response = await fetch('/api/tools/email-references', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content }),
    signal
  });

  return parseJsonResponse(response);
};

export const deleteEmailReference = async ({ id, signal }) => {
  const response = await fetch(`/api/tools/email-references/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
    signal
  });

  return parseJsonResponse(response);
};
