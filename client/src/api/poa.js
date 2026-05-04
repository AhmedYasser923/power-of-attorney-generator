const parseJsonResponse = async (response) => {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || payload.error || 'Request failed. Please try again.');
  }

  return payload;
};

export const autofillPoa = async (messyText) => {
  const response = await fetch('/api/autofill', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messyText })
  });

  return parseJsonResponse(response);
};

export const generatePoaPdf = async ({ endpoint, formData }) => {
  const response = await fetch(endpoint, {
    method: 'POST',
    credentials: 'same-origin',
    body: formData
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || `Server error: ${response.status}`);
  }

  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('application/pdf')) {
    throw new Error('PDF generation did not return a PDF. Make sure the backend is running on port 3000.');
  }

  const disposition = response.headers.get('Content-Disposition') || '';
  const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
  const filename = match?.[1]?.replace(/['"]/g, '') || 'document.pdf';
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  window.URL.revokeObjectURL(url);
  link.remove();

  return { filename };
};
