import { useEffect, useRef, useState } from 'react';
import { checkEoc, searchAirports, syncEoc } from '../../api/eocRadar.js';
import { parseDateFromDisplay } from '../../utils/dateUtils.js';
import './EocRadarPage.css';

function formatDateForDisplay(value) {
  if (!value) return '';

  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect height="18" rx="2" ry="2" width="18" x="3" y="4" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  );
}

function AirportField({ airport, id, label, onAirportChange, onCountryChange, placeholder }) {
  const abortRef = useRef(null);
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => () => abortRef.current?.abort(), []);

  const updateAirport = async (value) => {
    onAirportChange(value, '');
    onCountryChange('');

    if (value.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const results = await searchAirports({ query: value, signal: controller.signal });
      setSuggestions(results);
      setOpen(results.length > 0);

      const exact = results.find((item) => (
        item.iata?.toLowerCase() === value.trim().toLowerCase() ||
        item.city?.toLowerCase() === value.trim().toLowerCase() ||
        item.name?.toLowerCase() === value.trim().toLowerCase()
      ));

      if (exact) {
        onAirportChange(exact.iata || value, exact.iata || value);
        onCountryChange(exact.country || '');
        setOpen(false);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setSuggestions([]);
        setOpen(false);
      }
    }
  };

  const selectAirport = (item) => {
    const code = item.iata || '';
    onAirportChange(code || item.name || '', code || item.name || '');
    onCountryChange(item.country || '');
    setOpen(false);
  };

  return (
    <label className="eoc-field" htmlFor={id}>
      <span>{label}</span>
      <div className="eoc-autocomplete">
        <input
          autoComplete="off"
          className="eoc-input eoc-input--mono"
          id={id}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => updateAirport(event.target.value)}
          onFocus={() => setOpen(suggestions.length > 0)}
          placeholder={placeholder}
          type="text"
          value={airport.value}
        />
        {open && (
          <div className="eoc-autocomplete__list">
            {suggestions.map((item) => (
              <button
                key={`${item.iata || item.name}-${item.city || ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectAirport(item)}
                type="button"
              >
                <strong>{item.iata || 'N/A'}</strong>
                <span>{item.city || item.name || 'Unknown'}{item.country ? `, ${item.country}` : ''}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </label>
  );
}

function EocResult({ result }) {
  if (!result) return null;

  if (result.error) {
    return <div className="eoc-notice eoc-notice--danger">{result.error}</div>;
  }

  if (!result.eocFound || !result.events?.length) {
    return (
      <div className="eoc-result eoc-result--clear">
        <p>No EOCs found for this route on this date.</p>
      </div>
    );
  }

  return (
    <div className="eoc-result eoc-result--danger">
      <h2>
        {result.events.length > 1
          ? `Multiple Extraordinary Circumstances Detected (${result.events.length})`
          : 'Extraordinary Circumstance Detected'}
      </h2>
      <div className="eoc-events">
        {result.events.map((event, index) => (
          <div className="eoc-event" key={`${event.category || 'event'}-${event.location || index}-${index}`}>
            <span>Category</span>
            <strong>{event.category || ''}</strong>
            <span>Event</span>
            <strong>{event.event || ''}</strong>
            <span>Location</span>
            <strong>{event.location || ''}</strong>
            <span>Decision</span>
            <strong className="eoc-event__decision">{event.decision || ''}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EocRadarPage() {
  const datePickerRef = useRef(null);
  const checkAbortRef = useRef(null);
  const syncAbortRef = useRef(null);
  const [date, setDate] = useState('');
  const [dateDisplay, setDateDisplay] = useState('');
  const [origin, setOrigin] = useState({ value: '', iata: '' });
  const [destination, setDestination] = useState({ value: '', iata: '' });
  const [originCountry, setOriginCountry] = useState('');
  const [destinationCountry, setDestinationCountry] = useState('');
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);
  const [syncResult, setSyncResult] = useState(null);

  useEffect(() => () => {
    checkAbortRef.current?.abort();
    syncAbortRef.current?.abort();
  }, []);

  const setSelectedDate = (nextDate) => {
    setDate(nextDate);
    setDateDisplay(formatDateForDisplay(nextDate));
  };

  const openDatePicker = () => {
    const input = datePickerRef.current;
    if (!input) return;

    if (typeof input.showPicker === 'function') input.showPicker();
    else input.click();
  };

  const handleDatePaste = (event) => {
    const parsed = parseDateFromDisplay(event.clipboardData?.getData('text'));

    if (parsed) {
      event.preventDefault();
      setSelectedDate(parsed);
    }
  };

  const handleDateTyping = (value) => {
    setDateDisplay(value);

    const parsed = parseDateFromDisplay(value);
    if (parsed) setDate(parsed);
  };

  const scan = async () => {
    if (!date) {
      setResult({ error: 'Date is required to scan EOCs.' });
      return;
    }

    checkAbortRef.current?.abort();
    const controller = new AbortController();
    checkAbortRef.current = controller;
    setChecking(true);
    setResult(null);

    try {
      const data = await checkEoc({
        date,
        originIata: origin.iata || origin.value.trim(),
        destIata: destination.iata || destination.value.trim(),
        originCountry,
        destCountry: destinationCountry,
        signal: controller.signal
      });

      setResult(data);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setResult({ error: 'Error scanning EOC database.' });
      }
    } finally {
      if (checkAbortRef.current === controller) {
        setChecking(false);
      }
    }
  };

  const sync = async () => {
    syncAbortRef.current?.abort();
    const controller = new AbortController();
    syncAbortRef.current = controller;
    setSyncing(true);
    setSyncResult(null);

    try {
      const data = await syncEoc({ signal: controller.signal });

      if (data.success) {
        const deltaLabel = data.delta > 0
          ? `+${data.delta} new`
          : data.delta < 0
            ? `${data.delta} removed`
            : 'no change';

        setSyncResult({
          type: 'success',
          text: `Synced ${data.newCount} records`,
          delta: deltaLabel,
          deltaTone: data.delta > 0 ? 'positive' : data.delta < 0 ? 'negative' : 'neutral'
        });
      } else {
        setSyncResult({ type: 'danger', text: `Sync failed: ${data.error || 'Unknown error'}` });
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setSyncResult({ type: 'danger', text: 'Network error during sync.' });
      }
    } finally {
      if (syncAbortRef.current === controller) {
        setSyncing(false);
      }
    }
  };

  return (
    <section className="eoc-radar" aria-labelledby="eoc-radar-title">
      <header className="eoc-radar__header">
        <h1 id="eoc-radar-title">ROC Radar</h1>
        <p>Scan extraordinary circumstance records by flight date and route.</p>
      </header>

      <div className="eoc-card">
        <div className="eoc-grid">
          <label className="eoc-field" htmlFor="eoc-date-display">
            <span>Flight Date</span>
            <div className="eoc-date-control">
              <input
                className="eoc-input"
                id="eoc-date-display"
                onChange={(event) => handleDateTyping(event.target.value)}
                onPaste={handleDatePaste}
                placeholder="Select or paste a date..."
                type="text"
                value={dateDisplay}
              />
              <input
                className="eoc-date-picker"
                onChange={(event) => setSelectedDate(event.target.value)}
                ref={datePickerRef}
                type="date"
                value={date}
              />
              <button
                aria-label="Choose date"
                className="eoc-date-trigger"
                onClick={openDatePicker}
                type="button"
              >
                <CalendarIcon />
              </button>
            </div>
          </label>

          <AirportField
            airport={origin}
            id="eoc-origin"
            label="Origin Airport"
            onAirportChange={(value, iata) => setOrigin({ value, iata })}
            onCountryChange={setOriginCountry}
            placeholder="e.g. LHR or Heathrow"
          />

          <AirportField
            airport={destination}
            id="eoc-destination"
            label="Destination Airport"
            onAirportChange={(value, iata) => setDestination({ value, iata })}
            onCountryChange={setDestinationCountry}
            placeholder="e.g. BER or Berlin"
          />

          <label className="eoc-field" htmlFor="eoc-origin-country">
            <span>Origin Country</span>
            <input
              className="eoc-input"
              id="eoc-origin-country"
              placeholder="Auto-filled"
              readOnly
              tabIndex="-1"
              type="text"
              value={originCountry}
            />
          </label>

          <label className="eoc-field" htmlFor="eoc-destination-country">
            <span>Destination Country</span>
            <input
              className="eoc-input"
              id="eoc-destination-country"
              placeholder="Auto-filled"
              readOnly
              tabIndex="-1"
              type="text"
              value={destinationCountry}
            />
          </label>
        </div>

        <div className="eoc-actions">
          <button className="eoc-button" disabled={checking} onClick={scan} type="button">
            {checking ? 'Scanning...' : 'Scan EOC Database'}
          </button>
          <button className="eoc-button eoc-button--secondary" disabled={syncing} onClick={sync} type="button">
            {syncing ? 'Syncing...' : 'Sync EOC Database'}
          </button>
        </div>

        {syncResult && (
          <div className={`eoc-notice eoc-notice--${syncResult.type}`}>
            {syncResult.text}
            {syncResult.delta && (
              <span className={`eoc-sync-delta eoc-sync-delta--${syncResult.deltaTone}`}>
                {syncResult.delta}
              </span>
            )}
          </div>
        )}

        <EocResult result={result} />
      </div>
    </section>
  );
}
