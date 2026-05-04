import { useEffect, useRef, useState } from 'react';
import { lookupIata } from '../../api/iataLookup.js';
import './IataLookupPage.css';

function IataResults({ query, results, searched, error }) {
  if (error) {
    return <div className="iata-result iata-result--danger">{error}</div>;
  }

  if (!searched) return null;

  if (!results.length) {
    return <div className="iata-result iata-result--warning">No airlines found for "{query}".</div>;
  }

  return (
    <div className="iata-table-wrap">
      <table className="iata-table">
        <thead>
          <tr>
            <th>Airline</th>
            <th>IATA</th>
            <th>ICAO</th>
            <th>Country</th>
          </tr>
        </thead>
        <tbody>
          {results.map((airline, index) => (
            <tr key={`${airline.name || 'airline'}-${airline.iata || 'iata'}-${airline.icao || 'icao'}-${index}`}>
              <td>{airline.name || 'Unknown'}</td>
              <td><span>{airline.iata || 'N/A'}</span></td>
              <td><span>{airline.icao || 'N/A'}</span></td>
              <td>{airline.country || 'N/A'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function IataLookupPage() {
  const abortRef = useRef(null);
  const [query, setQuery] = useState('');
  const [searchedQuery, setSearchedQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => abortRef.current?.abort(), []);

  const runLookup = async () => {
    const value = query.trim();

    if (value.length < 2) {
      setSearched(true);
      setSearchedQuery(value);
      setResults([]);
      setError('Enter at least 2 characters.');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError('');
    setSearched(true);
    setSearchedQuery(value.toLowerCase());

    try {
      const data = await lookupIata({ query: value, signal: controller.signal });
      setResults(data);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setResults([]);
        setError('Error fetching IATA data.');
      }
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  };

  const submit = (event) => {
    event.preventDefault();
    runLookup();
  };

  return (
    <section className="iata-lookup" aria-labelledby="iata-lookup-title">
      <header className="iata-lookup__header">
        <h1 id="iata-lookup-title">IATA Lookup</h1>
        <p>Resolve airline codes and carrier details instantly.</p>
      </header>

      <form className="iata-card" onSubmit={submit}>
        <label className="iata-field" htmlFor="iata-lookup-input-react">
          <span>Airline Name or IATA Code</span>
          <input
            autoComplete="off"
            className="iata-input"
            id="iata-lookup-input-react"
            onChange={(event) => {
              setQuery(event.target.value);
              setError('');
            }}
            placeholder="e.g. AA or American Airlines"
            type="text"
            value={query}
          />
        </label>

        <button className="iata-button" disabled={loading} type="submit">
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      <div className="iata-results" aria-live="polite">
        {loading
          ? <div className="iata-result">Searching...</div>
          : <IataResults error={error} query={searchedQuery} results={results} searched={searched} />}
      </div>
    </section>
  );
}
