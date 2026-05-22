import { useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import './AutoReload.css';

const POLL_INTERVAL_MS = 60000;
const CONFIRMS_REQUIRED = 3;
const BANNER_VISIBLE_MS = 3000;

function showUpdateBanner(message, reloadingRef) {
  if (reloadingRef.current) return;
  reloadingRef.current = true;

  const overlay = document.createElement('div');
  overlay.className = 'auto-reload-overlay';
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('is-visible'));

  const toast = document.createElement('div');
  toast.className = 'auto-reload-toast';
  toast.innerHTML = `
    <div class="auto-reload-toast__row">
      <svg class="auto-reload-toast__spinner" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-6.22-8.56" />
      </svg>
      <div>
        <div class="auto-reload-toast__title"></div>
        <div class="auto-reload-toast__subtitle">This page will refresh automatically</div>
      </div>
    </div>
    <div class="auto-reload-toast__bar"></div>
  `;
  toast.querySelector('.auto-reload-toast__title').textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));

  setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => window.location.reload(), 500);
  }, BANNER_VISIBLE_MS);
}

export default function AutoReload() {
  const { user } = useAuth();
  const reloadingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let knownVersion = null;
    let pendingVersion = null;
    let confirmCount = 0;

    const checkVersion = async () => {
      try {
        const res = await fetch('/api/version', { credentials: 'same-origin' });
        if (!res.ok) return;
        const { version } = await res.json();
        if (cancelled || !version) return;

        if (!knownVersion) {
          knownVersion = version;
          return;
        }
        if (version === knownVersion) {
          pendingVersion = null;
          confirmCount = 0;
          return;
        }
        if (version === pendingVersion) {
          confirmCount += 1;
          if (confirmCount >= CONFIRMS_REQUIRED) {
            showUpdateBanner('A new version has been deployed. Reloading...', reloadingRef);
          }
        } else {
          pendingVersion = version;
          confirmCount = 1;
        }
      } catch {
        /* network blip — try again next tick */
      }
    };

    checkVersion();
    const intervalId = setInterval(checkVersion, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (user?.role !== 'admin') return undefined;

    const es = new EventSource('/api/sse/events', { withCredentials: true });
    es.onmessage = (e) => {
      if (e.data === 'reload') {
        showUpdateBanner('An update has occurred. Reloading...', reloadingRef);
      }
    };
    es.onerror = () => {
      // Browser will auto-reconnect; nothing to do here.
    };

    return () => es.close();
  }, [user?.role]);

  return null;
}
