import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { analyzeTicketFiles } from '../../api/ticketAnalyzer.js';
import AnalysisResults from './components/AnalysisResults.jsx';
import TicketDropzone from './components/TicketDropzone.jsx';
import TicketPreviewBar from './components/TicketPreviewBar.jsx';
import { hasPartialDates, normalizeJourneys } from './ticketAnalyzerUtils.js';
import './TicketAnalyzerPage.css';

function isValidYear(year) {
  return /^\d{4}$/.test(String(year || '').trim());
}

export default function TicketAnalyzerPage({ isActive = true }) {
  const abortRef = useRef(null);
  const timerRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [journeyYear, setJourneyYear] = useState('');
  const [rawResult, setRawResult] = useState(null);
  const [error, setError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [selectedFlights, setSelectedFlights] = useState(new Map());
  const [appliedYear, setAppliedYear] = useState('');
  const [yearApplySignal, setYearApplySignal] = useState(0);
  const [showApplyYear, setShowApplyYear] = useState(false);

  const journeys = useMemo(() => normalizeJourneys(rawResult), [rawResult]);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (!rawResult || rawResult.noFlightData) {
      setShowApplyYear(false);
      return;
    }

    const containsPartialDates = hasPartialDates(journeys);
    if (!containsPartialDates) {
      setShowApplyYear(false);
      return;
    }

    if (isValidYear(journeyYear)) {
      setAppliedYear(journeyYear.trim());
      setYearApplySignal((current) => current + 1);
      setShowApplyYear(false);
    } else {
      setShowApplyYear(true);
    }
  }, [journeyYear, journeys, rawResult]);

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
    setAppliedYear(journeyYear.trim());
    setYearApplySignal((current) => current + 1);
    setShowApplyYear(false);
  };

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
        <p>
          Drop multiple e-tickets, boarding passes, or flight screenshots below. The analyzer extracts passenger data and evaluates EC261 / UK261 claim eligibility.
        </p>
      </header>

      <div className="ticket-year-box">
        <label htmlFor="ticket-journey-year">Confirm Flight Year</label>
        <p>
          Boarding passes often hide the year. Enter the year of travel before analyzing when the document only shows day and month.
        </p>
        <div>
          <input
            id="ticket-journey-year"
            max="2050"
            min="2000"
            onChange={(event) => setJourneyYear(event.target.value)}
            placeholder="YYYY"
            type="number"
            value={journeyYear}
          />
          {showApplyYear && (
            <button disabled={!isValidYear(journeyYear)} onClick={applyYear} type="button">
              Apply Year
            </button>
          )}
        </div>
      </div>

      <TicketDropzone active={isActive} onFilesAdd={addFiles} />

      <TicketPreviewBar
        analyzing={analyzing}
        elapsedSeconds={elapsedSeconds}
        files={files}
        onAnalyze={analyze}
        onClear={clearFiles}
      />

      {error && (
        <div className="ticket-error" role="alert">
          {error}
        </div>
      )}

      <AnalysisResults
        appliedYear={appliedYear}
        onClearSelection={() => setSelectedFlights(new Map())}
        onSelectChange={updateSelection}
        rawResult={rawResult}
        selectedFlights={selectedFlights}
        yearApplySignal={yearApplySignal}
      />
    </section>
  );
}
