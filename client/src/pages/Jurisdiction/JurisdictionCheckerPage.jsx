import { useMemo, useState } from 'react';
import {
  formatCountry,
  formatLimit,
  getCountryMatches,
  JURISDICTION_LIMITS,
  normalizeCountry
} from './jurisdictionData.js';
import './JurisdictionCheckerPage.css';

function JurisdictionResult({ query }) {
  const normalized = normalizeCountry(query);
  const limit = JURISDICTION_LIMITS[normalized];

  if (!normalized || limit === undefined) return null;

  return (
    <article className="jurisdiction-result">
      <div className="jurisdiction-result__top">
        <div>
          <h2>{formatCountry(normalized)}</h2>
          <p>EC261 claim limitation period</p>
        </div>
        <span>Limit {formatLimit(limit)}</span>
      </div>
    </article>
  );
}

export default function JurisdictionCheckerPage() {
  const [country, setCountry] = useState('');
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => getCountryMatches(country), [country]);

  const updateCountry = (value) => {
    setCountry(value);
    setOpen(getCountryMatches(value).length > 0);
  };

  const selectCountry = (value) => {
    setCountry(value);
    setOpen(false);
  };

  return (
    <section className="jurisdiction-checker" aria-labelledby="jurisdiction-title">
      <header className="jurisdiction-checker__header">
        <h1 id="jurisdiction-title">Jurisdiction Checker</h1>
        <p>Identify applicable compensation limitation periods by country.</p>
      </header>

      <div className="jurisdiction-card">
        <label className="jurisdiction-field" htmlFor="jurisdiction-country">
          <span>Country</span>
          <div className="jurisdiction-autocomplete">
            <input
              autoComplete="off"
              className="jurisdiction-input"
              id="jurisdiction-country"
              onBlur={() => window.setTimeout(() => setOpen(false), 120)}
              onChange={(event) => updateCountry(event.target.value)}
              onFocus={() => setOpen(matches.length > 0)}
              placeholder="Start typing a country... e.g. Germany"
              type="text"
              value={country}
            />

            {open && matches.length > 0 && (
              <div className="jurisdiction-autocomplete__list">
                {matches.map((match) => (
                  <button
                    key={match}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectCountry(match)}
                    type="button"
                  >
                    {formatCountry(match)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </label>
      </div>

      <div className="jurisdiction-results" aria-live="polite">
        <JurisdictionResult query={country} />
      </div>
    </section>
  );
}
