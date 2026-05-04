import { useEffect, useRef, useState } from 'react';
import { getCiriumFlightStatus } from '../../api/flightStats.js';
import FlightStatusCard from './FlightStatusCard.jsx';
import { getFlightStatsSearchData, parseDateFromDisplay } from './flightStatsUtils.js';
import './FlightStatsPage.css';

export default function FlightStatsPage() {
  const abortRef = useRef(null);
  const [flightNumber, setFlightNumber] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState([]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleDatePaste = (event) => {
    const parsed = parseDateFromDisplay(event.clipboardData?.getData('text'));

    if (parsed) {
      event.preventDefault();
      setDate(parsed);
    }
  };

  const removeResult = (id) => {
    setResults((current) => current.filter((result) => result.id !== id));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');

    const search = getFlightStatsSearchData(flightNumber, date);
    if (search.error) {
      setError(search.error);
      return;
    }

    const key = `${search.flight.display}-${date}`;
    if (results.some((result) => result.key === key)) {
      setError('This flight and date are already in the results.');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const data = await getCiriumFlightStatus({
        flightNumber: search.flight.display,
        date,
        signal: controller.signal
      });

      const id = `${key}-${Date.now()}`;
      const nextResult = data.aiStats
        ? { id, key, flightNumber: search.flight.display, date, data }
        : { id, key, flightNumber: search.flight.display, date, error: data.error || 'Status unavailable.' };

      setResults((current) => [nextResult, ...current]);
      setFlightNumber('');
    } catch (err) {
      if (err.name === 'AbortError') return;

      const id = `${key}-${Date.now()}`;
      setResults((current) => [{
        id,
        key,
        flightNumber: search.flight.display,
        date,
        error: err.message || 'Flight status search failed.'
      }, ...current]);
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  };

  return (
    <section className="flight-stats" aria-labelledby="flight-stats-title">
      <header className="flight-stats__header">
        <h1 id="flight-stats-title">FlightStats</h1>
        <p>Search Cirium flight status data by flight number and operation date.</p>
      </header>

      <form className="flight-stats-form" onSubmit={submit}>
        <div className="flight-stats-form__grid">
          <label className="flight-stats-field" htmlFor="flight-stats-number">
            <span>Flight Number</span>
            <input
              autoComplete="off"
              className="flight-stats-input flight-stats-input--mono"
              id="flight-stats-number"
              onChange={(event) => setFlightNumber(event.target.value.toUpperCase())}
              placeholder="e.g. U28412"
              type="text"
              value={flightNumber}
            />
          </label>

          <label className="flight-stats-field" htmlFor="flight-stats-date">
            <span>Flight Date</span>
            <input
              className="flight-stats-input"
              id="flight-stats-date"
              onChange={(event) => setDate(event.target.value)}
              onPaste={handleDatePaste}
              type="date"
              value={date}
            />
          </label>

          <button className="flight-stats-button" disabled={loading || !flightNumber.trim() || !date} type="submit">
            {loading ? 'Searching...' : 'Search Flight'}
          </button>
        </div>

        {error && <div className="flight-stats-alert flight-stats-alert--error">{error}</div>}
      </form>

      <div className="flight-stats-results" aria-live="polite">
        {loading && <FlightStatusCard result={{ loading: true }} />}

        {results.map((result) => (
          <article className="flight-stats-result" key={result.id}>
            <div className="flight-stats-result__header">
              <div>
                <strong>{result.flightNumber}</strong>
                <span>{result.date}</span>
              </div>
              <button onClick={() => removeResult(result.id)} type="button">Dismiss</button>
            </div>
            <FlightStatusCard
              flightNumber={result.flightNumber}
              result={result.error ? { error: result.error } : { data: result.data }}
            />
          </article>
        ))}
      </div>
    </section>
  );
}
