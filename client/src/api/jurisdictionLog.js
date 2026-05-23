export function logJurisdictionCheck({ country }) {
  return fetch('/api/tools/log-jurisdiction-check', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ country })
  }).catch(() => {});
}
