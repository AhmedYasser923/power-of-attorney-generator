import { useEffect, useRef, useState } from 'react';
import { searchAirports } from '../../api/ec261Calculator.js';
import { calculateDistanceKm, getCompensation } from './ec261Utils.js';
import './Ec261CalculatorPage.css';

const EMPTY_AIRPORT = {
  value: '',
  iata: '',
  country: '',
  lat: '',
  lon: ''
};

function AirportField({ airport, countryId, id, label, onAirportChange, placeholder }) {
  const abortRef = useRef(null);
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => () => abortRef.current?.abort(), []);

  const updateAirport = async (value) => {
    onAirportChange({ ...EMPTY_AIRPORT, value });

    if (value.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const data = await searchAirports({ query: value, signal: controller.signal });
      setSuggestions(data);
      setOpen(data.length > 0);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setSuggestions([]);
        setOpen(false);
      }
    }
  };

  const selectAirport = (item) => {
    onAirportChange({
      value: `${item.name || item.iata || ''}${item.city ? `, ${item.city}` : ''}`,
      iata: item.iata || '',
      country: item.country || '',
      lat: item.lat || '',
      lon: item.lon || ''
    });
    setOpen(false);
  };

  return (
    <>
      <label className="ec261-field" htmlFor={id}>
        <span>{label}</span>
        <div className="ec261-autocomplete">
          <input
            autoComplete="off"
            className="ec261-input ec261-input--mono"
            id={id}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            onChange={(event) => updateAirport(event.target.value)}
            onFocus={() => setOpen(suggestions.length > 0)}
            placeholder={placeholder}
            type="text"
            value={airport.value}
          />
          {open && (
            <div className="ec261-autocomplete__list">
              {suggestions.map((item) => (
                <button
                  key={`${item.iata || item.name}-${item.city || ''}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectAirport(item)}
                  type="button"
                >
                  <strong>{item.iata || 'N/A'}</strong>
                  <span>{item.name || 'Unknown'}{item.city ? `, ${item.city}` : ''}{item.country ? `, ${item.country}` : ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </label>

      <label className="ec261-field" htmlFor={countryId}>
        <span>{label.replace('Airport', 'Country')}</span>
        <input
          className="ec261-input"
          id={countryId}
          placeholder="Auto-filled"
          readOnly
          tabIndex="-1"
          type="text"
          value={airport.country}
        />
      </label>
    </>
  );
}

function CompensationResult({ result }) {
  if (!result) return null;

  return (
    <article className="ec261-result">
      <div className="ec261-comp">
        <strong>{result.amount}</strong>
        <span>Statutory compensation per passenger</span>
      </div>

      <div className="ec261-row">
        <span>Route</span>
        <strong className="ec261-row__mono">{result.origin} -&gt; {result.destination}</strong>
      </div>
      <div className="ec261-row">
        <span>Distance</span>
        <strong>{result.distanceKm} km</strong>
      </div>
      <div className="ec261-row">
        <span>Band</span>
        <strong>{result.band}</strong>
      </div>
      <div className="ec261-row">
        <span>Regulation</span>
        <strong>EU 261/2004</strong>
      </div>
    </article>
  );
}

export default function Ec261CalculatorPage() {
  const [origin, setOrigin] = useState(EMPTY_AIRPORT);
  const [destination, setDestination] = useState(EMPTY_AIRPORT);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const calculate = () => {
    setError('');

    if (!origin.value.trim() || !destination.value.trim()) {
      setError('Origin and destination are required.');
      return;
    }

    let distanceKm = calculateDistanceKm(origin, destination);
    if (distanceKm === null) {
      const manualDistance = window.prompt('Please select airports from the dropdown so we can calculate GPS distance, OR manually enter the flight distance in KM here:');
      if (manualDistance === null || manualDistance.trim() === '') return;

      distanceKm = Number.parseFloat(manualDistance);
      if (Number.isNaN(distanceKm)) {
        setError('A valid number is required for distance.');
        return;
      }
    }

    const compensation = getCompensation({
      distanceKm,
      originCountry: origin.country,
      destinationCountry: destination.country
    });

    setResult({
      ...compensation,
      distanceKm,
      origin: (origin.iata || origin.value || '???').toUpperCase(),
      destination: (destination.iata || destination.value || '???').toUpperCase()
    });
  };

  return (
    <section className="ec261-calculator" aria-labelledby="ec261-title">
      <header className="ec261-calculator__header">
        <h1 id="ec261-title">EC261 Compensation Calculator</h1>
        <p>Calculate statutory passenger compensation under EU Regulation 261/2004.</p>
      </header>

      <div className="ec261-card">
        <div className="ec261-grid">
          <AirportField
            airport={origin}
            countryId="ec261-origin-country"
            id="ec261-origin"
            label="Departure Airport"
            onAirportChange={setOrigin}
            placeholder="e.g. LHR or Heathrow"
          />

          <AirportField
            airport={destination}
            countryId="ec261-destination-country"
            id="ec261-destination"
            label="Arrival Airport"
            onAirportChange={setDestination}
            placeholder="e.g. JFK or Kennedy"
          />
        </div>

        <div className="ec261-actions">
          <button className="ec261-button" onClick={calculate} type="button">
            Calculate Compensation
          </button>
        </div>

        {error && <div className="ec261-alert">{error}</div>}
        <CompensationResult result={result} />
      </div>
    </section>
  );
}
