import { useEffect, useState } from 'react';
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

export default function FlightSearchPage() {
  const [flightNumber, setFlightNumber] = useState('');
  const [date, setDate] = useState('');
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

  const handleDatePaste = (event) => {
    const parsed = parseDateFromDisplay(event.clipboardData?.getData('text'));

    if (parsed) {
      event.preventDefault();
      setDate(parsed);
    }
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
            <input
              className="flight-tools-input"
              id="flight-search-date"
              onChange={(event) => setDate(event.target.value)}
              onPaste={handleDatePaste}
              type="date"
              value={date}
            />
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
        {override && (
          <div className="flight-tools-alert flight-tools-alert--info">
            <span>
              <strong>{override.name}</strong> doesn't resolve under IATA <code>{parsed.airline}</code> on every tracker. These trackers will be searched with:
            </span>
            <ul className="flight-tools-alert__codes">
              {TRACKERS.filter((t) => override.codes[t.key]).map((t) => (
                <li key={t.key}>
                  {t.label}: <code>{override.codes[t.key]}</code>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button className="flight-tools-button" disabled={!flightNumber.trim() || !date} type="submit">
          Search Flights
        </button>
      </form>
    </section>
  );
}
