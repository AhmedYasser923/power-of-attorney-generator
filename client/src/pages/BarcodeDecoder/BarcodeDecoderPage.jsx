import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeBarcodeImage } from '../../api/barcodeDecoder.js';
import './BarcodeDecoderPage.css';

const MAX_CONCURRENT_SCANS = 2;
const MIN_SCAN_ANIMATION_MS = 1100;

function PasteIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M8 7h8" />
      <path d="M8 11h8" />
      <path d="M8 15h5" />
      <path d="M9 3h6l1 2h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2l1-2Z" />
    </svg>
  );
}

function BarcodeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 5v14" />
      <path d="M7 5v14" />
      <path d="M11 5v14" />
      <path d="M14 5v14" />
      <path d="M20 5v14" />
      <path d="M17 5v14" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

const FAILURE_TIPS = {
  timeout: 'Try a tighter crop around the barcode area.',
  too_small: 'Use a larger image where the barcode takes more space.',
  too_blurry: 'Retake the image with steadier focus or paste a sharper crop.',
  low_contrast: 'Use a brighter image or crop away dark background around the barcode.',
  manual_adjustment_needed: 'Crop closer to the barcode and keep all edges visible.',
  no_barcode_found: 'Make sure the full barcode is visible in the image.',
};

const STATUS_LABELS = {
  queued: 'Queued',
  scanning: 'Scanning',
  decoded: 'Decoded',
  failed: 'Failed',
  canceled: 'Canceled',
};

const SCANNABLE_STATUSES = new Set(['failed', 'canceled']);

const confidenceLabel = (value) => {
  if (value === 'high') return 'High confidence';
  if (value === 'medium') return 'Medium confidence';
  if (value === 'low') return 'Low confidence';
  return 'Decoder result';
};

const recoveryNote = (result) => {
  if (result?.decodeInfo?.bcbpValid) return 'Boarding pass structure matched';
  if (result?.decodeInfo?.aggressiveProcessingUsed) return 'Recovered from enhanced copy';
  return 'Decoded without aggressive recovery';
};

const formatFileSize = (value) => {
  if (!Number.isFinite(value) || value <= 0) return 'Image';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const formatAirlineLabel = (airline) => {
  if (!airline?.name) return '';
  const code = airline.iata || airline.icao || '';
  return [code, airline.name].filter(Boolean).join(' - ');
};

const formatTicketIssuer = (issuer) => {
  if (!issuer?.prefix) return '';
  if (!issuer.matchFound || !issuer.airlines?.length) return `${issuer.prefix} - Unknown prefix`;

  const names = issuer.airlines
    .map(formatAirlineLabel)
    .filter(Boolean);

  return `${issuer.prefix} - ${names.slice(0, 2).join(' / ')}${names.length > 2 ? ` +${names.length - 2}` : ''}`;
};

const formatPossibleYears = (dateCandidates) => {
  const years = dateCandidates?.possibleYears;
  if (!Array.isArray(years) || years.length === 0) return '';
  return years.join(', ');
};

const formatMonthDay = (monthDay) => {
  const match = String(monthDay || '').match(/^(\d{2})-(\d{2})$/);
  if (!match) return '';

  const date = new Date(Date.UTC(2001, Number(match[1]) - 1, Number(match[2])));
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString('en-US', { month: 'short', day: '2-digit', timeZone: 'UTC' });
};

const formatDisplayDate = (parsed) => {
  const dateCandidates = parsed?.dateCandidates;
  const monthDay = formatMonthDay(dateCandidates?.visibleMonthDay);

  if (monthDay && dateCandidates?.julianDate) {
    return `${monthDay} / day ${dateCandidates.julianDate}`;
  }

  return parsed?.flightDate || '';
};

const extractTicketNumber = (result) => {
  if (result?.parsed?.eTicketNumber) return result.parsed.eTicketNumber;

  const raw = result?.raw || '';
  const exact = raw.match(/(?:^|\D)(\d{13})(?!\d)/);
  if (exact) return exact[1];

  const extended = raw.match(/(?:^|\D)(\d{14,16})(?!\d)/);
  if (!extended) return '';

  const candidate = extended[1].slice(0, 13);
  if (candidate.startsWith('000') || new Set(candidate).size <= 1) return '';
  return candidate;
};

const parsedFields = (result) => {
  const parsed = result?.parsed;
  if (!parsed) return [];

  const flight = [parsed.operatingCarrier, parsed.flightNumber].filter(Boolean).join(' ');
  const route = parsed.fromAirport && parsed.toAirport ? `${parsed.fromAirport}-${parsed.toAirport}` : '';
  const ticketNumber = extractTicketNumber(result);
  const operatingAirline = formatAirlineLabel(parsed.operatingAirline);
  const ticketIssuer = formatTicketIssuer(parsed.ticketIssuer);
  const possibleYears = formatPossibleYears(parsed.dateCandidates);
  const displayDate = formatDisplayDate(parsed);

  return [
    ['PNR', parsed.pnr],
    ['Passenger', parsed.passengerName],
    ['Route', route],
    ['Flight', flight],
    ['Airline', operatingAirline],
    ['Date', displayDate],
    ['Possible years', possibleYears],
    ['Ticket', ticketNumber],
    ['Ticket issuer', ticketIssuer],
    ['Ticket note', parsed.ticketExtraction?.warning],
  ].filter(([, value]) => value);
};

async function writeClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function waitForScanAnimation(startedAt) {
  const elapsed = Date.now() - startedAt;
  const remaining = MIN_SCAN_ANIMATION_MS - elapsed;
  if (remaining <= 0) return Promise.resolve();
  return new Promise((resolve) => window.setTimeout(resolve, remaining));
}

function BarcodeResult({ copied, onCopy, result }) {
  return (
    <div className="barcode-result">
      <div className="barcode-result__meta">
        <span className="barcode-result__note">{recoveryNote(result)}</span>
        <button className="barcode-icon-button" onClick={onCopy} type="button">
          <CopyIcon />
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      <pre>{result.raw}</pre>
    </div>
  );
}

function BarcodeExtractedPanel({ result }) {
  const fields = parsedFields(result);

  return (
    <div className="barcode-extracted">
      <div className="barcode-extracted__header">
        <strong>Extracted</strong>
        <div>
          <span className={`barcode-confidence is-${result.confidence || 'unknown'}`}>
            {confidenceLabel(result.confidence)}
          </span>
          {result.barcodeType && <span className="barcode-format">{result.barcodeType}</span>}
        </div>
      </div>

      {fields.length > 0 && (
        <dl className="barcode-extracted__fields">
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {fields.length === 0 && (
        <div className="barcode-extracted__fallback">Raw value recovered</div>
      )}
    </div>
  );
}

export default function BarcodeDecoderPage({ isActive = true }) {
  const abortControllersRef = useRef(new Map());
  const copyTimersRef = useRef(new Map());
  const idRef = useRef(0);
  const itemsRef = useRef([]);
  const objectUrlsRef = useRef(new Set());
  const pendingQueueRef = useRef([]);
  const pumpQueueRef = useRef(null);
  const rootRef = useRef(null);
  const runningCountRef = useRef(0);

  const [items, setItems] = useState([]);
  const [notice, setNotice] = useState('');

  const updateItems = useCallback((updater) => {
    setItems((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      itemsRef.current = next;
      return next;
    });
  }, []);

  const revokePreview = useCallback((item) => {
    if (!item?.previewUrl || !objectUrlsRef.current.has(item.previewUrl)) return;
    URL.revokeObjectURL(item.previewUrl);
    objectUrlsRef.current.delete(item.previewUrl);
  }, []);

  const decodeQueuedItem = useCallback(async (item) => {
    const controller = new AbortController();
    const scanStartedAt = Date.now();
    abortControllersRef.current.set(item.id, controller);
    updateItems((current) => current.map((entry) => (
      entry.id === item.id
        ? { ...entry, status: 'scanning', error: '', errorDetails: null, result: null, copied: false }
        : entry
    )));

    try {
      const payload = await decodeBarcodeImage({
        file: item.file,
        signal: controller.signal,
      });

      if (!payload.success) {
        await waitForScanAnimation(scanStartedAt);
        updateItems((current) => current.map((entry) => (
          entry.id === item.id
            ? {
              ...entry,
              status: 'failed',
              error: payload.error || 'Could not decode barcode.',
              errorDetails: payload,
              result: null,
            }
            : entry
        )));
        return;
      }

      await waitForScanAnimation(scanStartedAt);
      updateItems((current) => current.map((entry) => (
        entry.id === item.id
          ? { ...entry, status: 'decoded', result: payload, error: '', errorDetails: null }
          : entry
      )));
    } catch (err) {
      updateItems((current) => current.map((entry) => {
        if (entry.id !== item.id) return entry;
        if (err.name === 'AbortError') {
          return { ...entry, status: 'canceled', error: 'Scan canceled.', errorDetails: null };
        }
        return { ...entry, status: 'failed', error: err.message, errorDetails: null, result: null };
      }));
    } finally {
      if (abortControllersRef.current.get(item.id) === controller) {
        abortControllersRef.current.delete(item.id);
      }
    }
  }, [updateItems]);

  const pumpQueue = useCallback(() => {
    while (runningCountRef.current < MAX_CONCURRENT_SCANS && pendingQueueRef.current.length > 0) {
      const id = pendingQueueRef.current.shift();
      const item = itemsRef.current.find((entry) => entry.id === id);
      if (!item || item.status === 'scanning') continue;

      runningCountRef.current += 1;
      void decodeQueuedItem(item).finally(() => {
        runningCountRef.current = Math.max(0, runningCountRef.current - 1);
        pumpQueueRef.current?.();
      });
    }
  }, [decodeQueuedItem]);

  useEffect(() => {
    pumpQueueRef.current = pumpQueue;
  }, [pumpQueue]);

  useEffect(() => () => {
    pendingQueueRef.current = [];
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current.clear();
    copyTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    copyTimersRef.current.clear();
  }, []);

  const queueItems = useCallback((ids) => {
    const pendingIds = new Set(pendingQueueRef.current);
    const activeIds = new Set(abortControllersRef.current.keys());
    const nextIds = ids.filter((id) => {
      const item = itemsRef.current.find((entry) => entry.id === id);
      return item && SCANNABLE_STATUSES.has(item.status) && !pendingIds.has(id) && !activeIds.has(id);
    });

    if (nextIds.length === 0) return;

    const nextIdSet = new Set(nextIds);
    pendingQueueRef.current.push(...nextIds);
    updateItems((current) => current.map((item) => (
      nextIdSet.has(item.id)
        ? { ...item, status: 'queued', error: '', errorDetails: null, result: null, copied: false }
        : item
    )));
    window.setTimeout(() => pumpQueueRef.current?.(), 0);
  }, [updateItems]);

  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList || []);
    const imageFiles = incoming.filter((file) => file?.type?.startsWith('image/'));

    if (imageFiles.length === 0) {
      if (incoming.length > 0) setNotice('Only pasted image screenshots can be scanned.');
      return 0;
    }

    const newItems = imageFiles.map((file) => {
      const sequence = idRef.current + 1;
      const id = `barcode-${Date.now()}-${idRef.current}`;
      idRef.current += 1;
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);

      return {
        id,
        file,
        previewUrl,
        title: `Pasted screenshot ${sequence}`,
        name: file.name || `screenshot-${sequence}.png`,
        size: file.size,
        status: 'queued',
        result: null,
        error: '',
        errorDetails: null,
        copied: false,
      };
    });

    updateItems((current) => [...current, ...newItems]);
    pendingQueueRef.current.push(...newItems.map((item) => item.id));
    setNotice(`${newItems.length} screenshot${newItems.length === 1 ? '' : 's'} queued for scanning.`);
    window.setTimeout(() => pumpQueueRef.current?.(), 0);
    return newItems.length;
  }, [updateItems]);

  useEffect(() => {
    if (!isActive) return undefined;

    const handlePaste = (event) => {
      const clipboardFiles = Array.from(event.clipboardData?.files || []);
      const itemFiles = Array.from(event.clipboardData?.items || [])
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter(Boolean);
      const pastedFiles = clipboardFiles.length > 0 ? clipboardFiles : itemFiles;
      const count = addFiles(pastedFiles);
      if (count > 0) event.preventDefault();
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [addFiles, isActive]);

  const removeItem = (id) => {
    pendingQueueRef.current = pendingQueueRef.current.filter((queuedId) => queuedId !== id);
    const controller = abortControllersRef.current.get(id);
    if (controller) controller.abort();

    const item = itemsRef.current.find((entry) => entry.id === id);
    revokePreview(item);
    const timer = copyTimersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      copyTimersRef.current.delete(id);
    }
    updateItems((current) => current.filter((entry) => entry.id !== id));
  };

  const clearAll = () => {
    pendingQueueRef.current = [];
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();
    itemsRef.current.forEach(revokePreview);
    copyTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    copyTimersRef.current.clear();
    updateItems([]);
    setNotice('');
  };

  const copyItemResult = async (item) => {
    if (!item.result?.raw) return;

    await writeClipboard(item.result.raw);
    updateItems((current) => current.map((entry) => (
      entry.id === item.id ? { ...entry, copied: true } : entry
    )));

    const existing = copyTimersRef.current.get(item.id);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      updateItems((current) => current.map((entry) => (
        entry.id === item.id ? { ...entry, copied: false } : entry
      )));
      copyTimersRef.current.delete(item.id);
    }, 1600);
    copyTimersRef.current.set(item.id, timer);
  };

  return (
    <section
      className="barcode-decoder"
      aria-labelledby="barcode-decoder-title"
      ref={rootRef}
      tabIndex={-1}
    >
      <header className="barcode-decoder__header">
        <div>
          <h1 id="barcode-decoder-title">Barcode Decoder</h1>
          <p>Paste screenshots one after another and each image will scan in its own queue card.</p>
        </div>
      </header>

      <section className="barcode-scanner" aria-label="Barcode screenshot input">
        <button
          className="barcode-paste-target"
          onClick={() => rootRef.current?.focus()}
          type="button"
        >
          <span className="barcode-paste-target__icon">
            <PasteIcon />
          </span>
          <span>
            <strong>Paste screenshots</strong>
            <small>Every pasted QR or barcode screenshot is added to the queue.</small>
          </span>
        </button>

        {items.length > 0 && (
          <div className="barcode-actions" aria-label="Barcode queue actions">
            <button className="barcode-action barcode-action--danger" onClick={clearAll} type="button">
              Clear
            </button>
          </div>
        )}
      </section>

      {notice && (
        <div className="barcode-notice" role="status">
          {notice}
        </div>
      )}

      {items.length > 0 && (
        <section className="barcode-queue" aria-live="polite" aria-label="Barcode scan queue">
          {items.map((item, index) => (
            <article className={`barcode-item is-${item.status}`} key={item.id}>
              <div className={`barcode-item__preview${item.status === 'decoded' && item.result ? ' has-extracted' : ''}`}>
                {item.status === 'decoded' && item.result ? (
                  <BarcodeExtractedPanel result={item.result} />
                ) : (
                  <>
                    <img alt={`${item.title} preview`} src={item.previewUrl} />
                    {item.status === 'scanning' && <span className="barcode-scanline" />}
                  </>
                )}
                <span className={`barcode-status-pill is-${item.status}`}>
                  {STATUS_LABELS[item.status] || item.status}
                </span>
              </div>

              <div className="barcode-item__body">
                <div className="barcode-item__top">
                  <div className="barcode-item__title">
                    <h2>{item.title || `Screenshot ${index + 1}`}</h2>
                    <span>{item.name} / {formatFileSize(item.size)}</span>
                  </div>

                  <div className="barcode-item__actions">
                    {SCANNABLE_STATUSES.has(item.status) && (
                      <button className="barcode-icon-button" onClick={() => queueItems([item.id])} type="button">
                        <BarcodeIcon />
                        <span>Retry</span>
                      </button>
                    )}
                    <button
                      aria-label={`Remove ${item.title}`}
                      className="barcode-icon-button barcode-icon-button--icon"
                      onClick={() => removeItem(item.id)}
                      type="button"
                    >
                      <XIcon />
                    </button>
                  </div>
                </div>

                {item.status === 'queued' && (
                  <div className="barcode-item__placeholder">Waiting for an available scanner slot.</div>
                )}

                {item.status === 'scanning' && (
                  <div className="barcode-item__placeholder is-active">Recovering barcode from screenshot...</div>
                )}

                {item.status === 'canceled' && (
                  <div className="barcode-item__placeholder">Scan canceled.</div>
                )}

                {item.status === 'failed' && (
                  <div className="barcode-item__error" role="alert">
                    <strong>{item.error || 'Could not decode barcode.'}</strong>
                    <span>{FAILURE_TIPS[item.errorDetails?.reason] || 'Use a sharp image with the full barcode, visible edges, and a small margin.'}</span>
                  </div>
                )}

                {item.status === 'decoded' && item.result && (
                  <BarcodeResult
                    copied={item.copied}
                    onCopy={() => copyItemResult(item)}
                    result={item.result}
                  />
                )}
              </div>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
