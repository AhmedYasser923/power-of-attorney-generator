import { useEffect, useRef, useState } from 'react';
import { loadTrackerOverrides } from '../../api/trackerOverrides.js';
import { getFlightSearchData, parseDateFromDisplay, parseFlightNumber } from './flightToolsUtils.js';
import './FlightToolsPage.css';

const TRACKERS = [
  { key: 'airportInfo', label: 'AirportInfo' },
  { key: 'flightStats', label: 'FlightStats' },
  { key: 'flightera', label: 'Flightera' }
];

const initialTrackers = {
  airportInfo: true,
  flightStats: true,
  flightera: true
};

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

export default function FlightSearchPage() {
  const datePickerRef = useRef(null);
  const [flightNumber, setFlightNumber] = useState('');
  const [date, setDate] = useState('');
  const [dateDisplay, setDateDisplay] = useState('');
  const [trackers, setTrackers] = useState(initialTrackers);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [overrides, setOverrides] = useState({});

  useEffect(() => {
    let active = true;

    loadTrackerOverrides().then((map) => {
      if (active) setOverrides(map);
    });

    return () => { active = false; };
  }, []);

  const parsed = parseFlightNumber(flightNumber);
  const override = parsed ? overrides[parsed.airline] : null;

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
    const parsedDate = parseDateFromDisplay(event.clipboardData?.getData('text'));

    if (parsedDate) {
      event.preventDefault();
      setSelectedDate(parsedDate);
    }
  };

  const handleDateTyping = (value) => {
    setDateDisplay(value);

    const parsedDate = parseDateFromDisplay(value);
    if (parsedDate) setDate(parsedDate);
  };

  const toggleTracker = (key) => {
    setTrackers((current) => ({ ...current, [key]: !current[key] }));
  };

  const submit = (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    const selectedTrackers = TRACKERS.filter((tracker) => trackers[tracker.key]);
    if (selectedTrackers.length === 0) {
      setError('Select at least one tracker.');
      return;
    }

    const search = getFlightSearchData(flightNumber, date, override?.codes);
    if (search.error) {
      setError(search.error);
      return;
    }

    selectedTrackers.forEach((tracker) => {
      window.open(search.urls[tracker.key], '_blank', 'noopener');
    });

    setMessage(`Opened ${selectedTrackers.map((tracker) => tracker.label).join(', ')} for ${search.flight.display}.`);
  };

  return (
    <section className="flight-tools" aria-labelledby="flight-search-title">
      <header className="flight-tools__header">
        <h1 id="flight-search-title">Flight Search</h1>
        <p>Look up flight data across AirportInfo, FlightStats, and Flightera.</p>
      </header>

      <form className="flight-tools-card flight-search-form" onSubmit={submit}>
        <div className="flight-tools-grid">
          <label className="flight-tools-field" htmlFor="flight-search-number">
            <span>Flight Number</span>
            <input
              autoComplete="off"
              className="flight-tools-input flight-tools-input--mono"
              id="flight-search-number"
              onChange={(event) => setFlightNumber(event.target.value.toUpperCase())}
              placeholder="e.g. BA0123"
              type="text"
              value={flightNumber}
            />
          </label>

          <label className="flight-tools-field" htmlFor="flight-search-date">
            <span>Travel Date</span>
            <div className="flight-tools-date-control">
              <input
                className="flight-tools-input"
                id="flight-search-date"
                onChange={(event) => handleDateTyping(event.target.value)}
                onPaste={handleDatePaste}
                placeholder="Select or paste a date..."
                type="text"
                value={dateDisplay}
              />
              <input
                className="flight-tools-date-picker"
                onChange={(event) => setSelectedDate(event.target.value)}
                ref={datePickerRef}
                type="date"
                value={date}
              />
              <button
                aria-label="Choose date"
                className="flight-tools-date-trigger"
                onClick={openDatePicker}
                type="button"
              >
                <CalendarIcon />
              </button>
            </div>
          </label>
        </div>

        <div className="flight-tools-options" aria-label="Trackers">
          {TRACKERS.map((tracker) => (
            <label className="flight-tools-option" key={tracker.key}>
              <input
                checked={trackers[tracker.key]}
                onChange={() => toggleTracker(tracker.key)}
                type="checkbox"
              />
              <span>{tracker.label}</span>
            </label>
          ))}
        </div>

        {error && <div className="flight-tools-alert flight-tools-alert--error">{error}</div>}
        {message && <div className="flight-tools-alert flight-tools-alert--success">{message}</div>}
        {override && (() => {
          const overridden = TRACKERS.filter((t) => override.codes[t.key]);
          const unchanged = TRACKERS.filter((t) => !override.codes[t.key]);
          return (
            <div className="flight-tools-alert flight-tools-alert--info">
              <div className="flight-tools-alert__header">
                <span className="flight-tools-alert__badge" aria-hidden="true">i</span>
                <div className="flight-tools-alert__heading">
                  <strong className="flight-tools-alert__airline">{override.name}</strong>
                  <span className="flight-tools-alert__hint">Tracker code substitutions for IATA <code>{parsed.airline}</code></span>
                </div>
              </div>
              <ul className="flight-tools-alert__codes">
                {overridden.map((t) => (
                  <li key={t.key} className="flight-tools-alert__code-row">
                    <span className="flight-tools-alert__tracker-name">{t.label}</span>
                    <span className="flight-tools-alert__code-swap">
                      <code>{parsed.airline}</code>
                      <span className="flight-tools-alert__arrow" aria-hidden="true">→</span>
                      <code className="flight-tools-alert__code-replacement">{override.codes[t.key]}</code>
                    </span>
                  </li>
                ))}
              </ul>
              {unchanged.length > 0 && (
                <p className="flight-tools-alert__footnote">
                  {unchanged.map((t) => t.label).join(' and ')}{' '}
                  {unchanged.length === 1 ? 'uses' : 'use'} the default IATA <code>{parsed.airline}</code>.
                </p>
              )}
            </div>
          );
        })()}

        <button className="flight-tools-button" disabled={!flightNumber.trim() || !date} type="submit">
          Search Flights
        </button>
      </form>
    </section>
  );
}
