const parseJsonResponse = async (response) => {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || payload.error || 'Barcode decode failed.');
  }

  return payload;
};

export const decodeBarcodeImage = async ({ file, signal }) => {
  const body = new FormData();
  body.append('barcode', file);

  const response = await fetch('/api/decode-barcode', {
    method: 'POST',
    credentials: 'same-origin',
    body,
    signal,
  });

  return parseJsonResponse(response);
};
