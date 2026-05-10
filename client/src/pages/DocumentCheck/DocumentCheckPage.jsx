import { useEffect, useRef, useState } from 'react';
import { checkDocuments, searchAirlines } from '../../api/documentCheck.js';
import { getJurisdictionSuffix, isExactAirlineMatch } from './documentCheckUtils.js';
import './DocumentCheckPage.css';

function DocumentResult({ result }) {
  if (!result) return null;

  if (result.error) {
    return <div className="document-check-result document-check-result--danger">{result.error}</div>;
  }

  const country = result.country || 'Unknown';
  const countryLabel = `${country}${getJurisdictionSuffix(country)}`;

  return (
    <article className="document-check-result">
      <div className="document-check-result__top">
        <div>
          <h2>{result.airline}</h2>
          <div className="document-check-badges">
            <span className="document-check-badge document-check-badge--iata">IATA {result.iata || 'N/A'}</span>
            <span className="document-check-badge document-check-badge--icao">ICAO {result.icao || 'N/A'}</span>
            {result.ticketNumberCanReplacePnr && (
              <span className="document-check-badge document-check-badge--ticket-pnr">
                Ticket number can replace PNR
              </span>
            )}
            <span className="document-check-badge document-check-badge--country">{countryLabel}</span>
          </div>
        </div>
        <span className={`document-check-status${result.hasDocs ? ' document-check-status--warning' : ' document-check-status--success'}`}>
          {result.hasDocs ? 'Documents Required' : 'No Extra Docs Required'}
        </span>
      </div>

      <div className="document-check-row">
        <span>Required Claim Documents</span>
        <strong>{result.hasDocs ? 'Review needed' : 'Clear'}</strong>
      </div>

      <div className={`document-check-note${result.hasDocs ? '' : ' document-check-note--clear'}`}>
        {result.reqs || 'No documents required'}
      </div>

      {result.claimNote && (
        <div className="document-check-note document-check-note--claim">
          {result.claimNote}
        </div>
      )}
    </article>
  );
}

export default function DocumentCheckPage() {
  const searchAbortRef = useRef(null);
  const checkAbortRef = useRef(null);
  const [airline, setAirline] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => () => {
    searchAbortRef.current?.abort();
    checkAbortRef.current?.abort();
  }, []);

  const runCheck = async (airlineName) => {
    const value = String(airlineName || '').trim();
    if (value.length < 2) return;

    checkAbortRef.current?.abort();
    const controller = new AbortController();
    checkAbortRef.current = controller;
    setLoading(true);
    setResult(null);

    try {
      const data = await checkDocuments({ airline: value, signal: controller.signal });
      setResult(data);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setResult({ error: 'Error fetching document requirements.' });
      }
    } finally {
      if (checkAbortRef.current === controller) {
        setLoading(false);
      }
    }
  };

  const updateAirline = async (value) => {
    setAirline(value);
    setResult(null);

    if (value.trim().length < 2) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    try {
      const matches = await searchAirlines({ query: value, signal: controller.signal });
      const exactMatch = matches.find((match) => isExactAirlineMatch(match, value));

      setSuggestions(matches);
      setSuggestionsOpen(matches.length > 0 && !exactMatch);

      if (exactMatch) {
        setAirline(exactMatch.name);
        runCheck(exactMatch.name);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setSuggestions([]);
        setSuggestionsOpen(false);
      }
    }
  };

  const selectAirline = (match) => {
    setAirline(match.name);
    setSuggestionsOpen(false);
    runCheck(match.name);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setSuggestionsOpen(false);
    runCheck(airline);
  };

  return (
    <section className="document-check" aria-labelledby="document-check-title">
      <header className="document-check__header">
        <h1 id="document-check-title">Document Check</h1>
        <p>Verify required claim documents by airline.</p>
      </header>

      <form className="document-check-card" onSubmit={handleSubmit}>
        <label className="document-check-field" htmlFor="document-check-airline">
          <span>Airline</span>
          <div className="document-check-autocomplete">
            <input
              autoComplete="off"
              className="document-check-input"
              id="document-check-airline"
              onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)}
              onChange={(event) => updateAirline(event.target.value)}
              onFocus={() => setSuggestionsOpen(suggestions.length > 0)}
              placeholder="Start typing an airline name..."
              type="text"
              value={airline}
            />
            {suggestionsOpen && (
              <div className="document-check-autocomplete__list">
                {suggestions.map((match) => (
                  <button
                    key={`${match.name}-${match.iata || 'NA'}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectAirline(match)}
                    type="button"
                  >
                    <strong>{match.name}</strong>
                    <span>{match.iata && match.iata.toLowerCase() !== 'na' ? match.iata : 'N/A'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </label>
      </form>

      <div className="document-check-results" aria-live="polite">
        {loading && <div className="document-check-result">Checking requirements for {airline.trim()}...</div>}
        {!loading && <DocumentResult result={result} />}
      </div>
    </section>
  );
}
