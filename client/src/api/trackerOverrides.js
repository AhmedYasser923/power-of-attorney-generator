let cache = null;
let inflight = null;

export async function loadTrackerOverrides() {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = fetch('/api/tools/tracker-overrides', { credentials: 'same-origin' })
    .then(async (response) => {
      if (!response.ok) return {};
      return response.json().catch(() => ({}));
    })
    .catch(() => ({}))
    .then((map) => {
      cache = map || {};
      inflight = null;
      return cache;
    });

  return inflight;
}

export function getTrackerOverrides() {
  return cache || {};
}

export function logTrackerSearch({ flightNumber, date, trackers }) {
  return fetch('/api/tools/log-tracker-search', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flightNumber, date, trackers })
  }).catch(() => {});
}
