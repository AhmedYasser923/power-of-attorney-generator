import { useEffect, useRef, useState } from 'react';
import { getToolsFlightStatus } from '../../api/flightTools.js';
import FlightStatusResult from '../TicketAnalyzer/components/FlightStatusResult.jsx';
import { getFlightSearchData, parseDateFromDisplay } from './flightToolsUtils.js';
import './FlightToolsPage.css';

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

    const search = getFlightSearchData(flightNumber, date);
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
      const data = await getToolsFlightStatus({
        flightNumber: search.flight.display,
        date,
        signal: controller.signal
      });

      const id = `${key}-${Date.now()}`;
      const nextResult = data.aiStats
        ? { id, key, flightNumber: search.flight.display, date, data }
        : { id, key, flightNumber: search.flight.display, date, error: data.error || 'Status unavailable.' };

      setResults((current) => [nextResult, ...current]);
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
    <section className="flight-tools" aria-labelledby="flight-stats-title">
      <header className="flight-tools__header">
        <h1 id="flight-stats-title">FlightStats</h1>
        <p>Search the Cirium-backed status data used by the existing tool.</p>
      </header>

      <form className="flight-tools-card flight-stats-form" onSubmit={submit}>
        <div className="flight-tools-grid flight-tools-grid--stats">
          <label className="flight-tools-field" htmlFor="flight-stats-number">
            <span>Flight Number</span>
            <input
              autoComplete="off"
              className="flight-tools-input flight-tools-input--mono"
              id="flight-stats-number"
              onChange={(event) => setFlightNumber(event.target.value.toUpperCase())}
              placeholder="e.g. U28412"
              type="text"
              value={flightNumber}
            />
          </label>

          <label className="flight-tools-field" htmlFor="flight-stats-date">
            <span>Flight Date</span>
            <input
              className="flight-tools-input"
              id="flight-stats-date"
              onChange={(event) => setDate(event.target.value)}
              onPaste={handleDatePaste}
              type="date"
              value={date}
            />
          </label>

          <button className="flight-tools-button" disabled={loading || !flightNumber.trim() || !date} type="submit">
            {loading ? 'Searching...' : 'Search Flight'}
          </button>
        </div>

        {error && <div className="flight-tools-alert flight-tools-alert--error">{error}</div>}
      </form>

      <div className="flight-tools-results" aria-live="polite">
        {loading && <FlightStatusResult result={{ loading: true }} />}

        {results.map((result) => (
          <article className="flight-tools-result" key={result.id}>
            <div className="flight-tools-result__header">
              <div>
                <strong>{result.flightNumber}</strong>
                <span>{result.date}</span>
              </div>
              <button onClick={() => removeResult(result.id)} type="button">Dismiss</button>
            </div>
            <FlightStatusResult result={result.error ? { error: result.error } : { data: result.data }} />
          </article>
        ))}
      </div>
    </section>
  );
}
