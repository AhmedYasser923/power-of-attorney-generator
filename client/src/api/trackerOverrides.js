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
