import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { analyzeTicketFiles } from '../../api/ticketAnalyzer.js';
import { loadTrackerOverrides } from '../../api/trackerOverrides.js';
import AnalysisResults from './components/AnalysisResults.jsx';
import TicketDropzone from './components/TicketDropzone.jsx';
import TicketPreviewBar from './components/TicketPreviewBar.jsx';
import {
  applyYearToJourneys,
  hasFullDate,
  hasPartialDates,
  normalizeJourneys
} from './ticketAnalyzerUtils.js';
import './TicketAnalyzerPage.css';

function isValidYear(year) {
  return /^\d{4}$/.test(String(year || '').trim());
}

function withJourneys(rawResult, journeys) {
  if (Array.isArray(rawResult)) return journeys;
  return { ...rawResult, journeys };
}

export default function TicketAnalyzerPage({ isActive = true }) {
  const abortRef = useRef(null);
  const timerRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [journeyYear, setJourneyYear] = useState('');
  const [modelTier, setModelTier] = useState('standard');
  const [rawResult, setRawResult] = useState(null);
  const [error, setError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [selectedFlights, setSelectedFlights] = useState(new Map());
  const [showApplyYear, setShowApplyYear] = useState(false);

  const journeys = useMemo(() => normalizeJourneys(rawResult), [rawResult]);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    loadTrackerOverrides();
  }, []);

  useEffect(() => {
    if (!rawResult || rawResult.noFlightData) {
      setShowApplyYear(false);
      return;
    }

    setShowApplyYear(hasPartialDates(journeys));
  }, [journeys, rawResult]);

  const addFiles = useCallback((incomingFiles) => {
    setFiles((current) => [...current, ...incomingFiles]);
    setError('');
  }, []);

  const clearFiles = () => {
    abortRef.current?.abort();
    setFiles([]);
    setRawResult(null);
    setError('');
    setSelectedFlights(new Map());
    setAnalyzing(false);
    setElapsedSeconds(0);
    setShowApplyYear(false);
  };

  const startTimer = () => {
    const startedAt = Date.now();
    setElapsedSeconds(0);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((Date.now() - startedAt) / 1000);
    }, 100);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const analyze = async () => {
    if (!files.length) {
      setError('Please upload a ticket or boarding pass first.');
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setError('');
    setRawResult(null);
    setSelectedFlights(new Map());
    setAnalyzing(true);
    setShowApplyYear(false);
    startTimer();

    try {
      const result = await analyzeTicketFiles({
        files,
        journeyYear: isValidYear(journeyYear) ? journeyYear.trim() : '',
        tier: modelTier,
        signal: abortRef.current.signal
      });

      setRawResult(result);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      stopTimer();
      setAnalyzing(false);
    }
  };

  const applyYear = () => {
    if (!isValidYear(journeyYear)) {
      setError('Please enter a valid 4-digit year.');
      return;
    }

    setError('');
    if (!rawResult || rawResult.noFlightData) return;

    const result = applyYearToJourneys(journeys, journeyYear.trim());
    if (result.changed) {
      setRawResult(withJourneys(rawResult, result.journeys));
    }

    setShowApplyYear(result.unresolved);
    if (!result.changed && result.unresolved) {
      setError('Could not apply that year to one or more partial dates. Set those dates manually.');
    }
  };

  const updateFlightDate = useCallback((journeyIndex, routeIndex, legIndex, date) => {
    setRawResult((current) => {
      if (!current || current.noFlightData) return current;

      const nextJourneys = normalizeJourneys(current).map((journey, currentJourneyIndex) => ({
        ...journey,
        routes: (journey.routes || []).map((route, currentRouteIndex) => ({
          ...route,
          legs: (route.legs || []).map((leg, currentLegIndex) => {
            if (
              currentJourneyIndex !== journeyIndex ||
              currentRouteIndex !== routeIndex ||
              currentLegIndex !== legIndex
            ) {
              return leg;
            }

            const nextDate = String(date || '').trim();
            return {
              ...leg,
              date: nextDate,
              dateYearSource: hasFullDate(nextDate) ? 'manual' : 'unresolved',
              dateYearApplied: hasFullDate(nextDate) ? nextDate.slice(0, 4) : ''
            };
          })
        }))
      }));

      return withJourneys(current, nextJourneys);
    });
  }, []);

  const updateSelection = useCallback((item, checked) => {
    setSelectedFlights((current) => {
      const next = new Map(current);

      if (checked) next.set(item.id, item);
      else next.delete(item.id);

      return next;
    });
  }, []);

  return (
    <section className="ticket-analyzer" aria-labelledby="ticket-analyzer-title">
      <header className="ticket-analyzer__header">
        <h1 id="ticket-analyzer-title">Ticket Analyzer</h1>
      </header>

      <div className="ticket-dropzone__year">
        <label htmlFor="ticket-journey-year">Flight Year</label>
        <input
          id="ticket-journey-year"
          inputMode="numeric"
          maxLength="4"
          onChange={(e) => setJourneyYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="YYYY"
          type="text"
          value={journeyYear}
        />
        {showApplyYear && (
          <button disabled={!isValidYear(journeyYear)} onClick={applyYear} type="button">
            Apply
          </button>
        )}
      </div>

      <TicketDropzone
        active={isActive}
        onFilesAdd={addFiles}
      />

      <TicketPreviewBar
        analyzing={analyzing}
        elapsedSeconds={elapsedSeconds}
        files={files}
        modelTier={modelTier}
        onAnalyze={analyze}
        onClear={clearFiles}
        onTierChange={setModelTier}
      />

      {error && (
        <div className="ticket-error" role="alert">
          {error}
        </div>
      )}

      <AnalysisResults
        onDateChange={updateFlightDate}
        onClearSelection={() => setSelectedFlights(new Map())}
        onSelectChange={updateSelection}
        rawResult={rawResult}
        selectedFlights={selectedFlights}
      />
    </section>
  );
}
