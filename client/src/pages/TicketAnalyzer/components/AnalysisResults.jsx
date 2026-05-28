import { useMemo } from 'react';
import {
  assignPnrColors,
  getPnrDiagnostics,
  normalizeJourneys
} from '../ticketAnalyzerUtils.js';
import GroupSearchBar from './GroupSearchBar.jsx';
import JourneyResult from './JourneyResult.jsx';

export default function AnalysisResults({
  onDateChange,
  onClearSelection,
  onSelectChange,
  rawResult,
  selectedFlights
}) {
  const journeys = useMemo(() => normalizeJourneys(rawResult), [rawResult]);
  const pnrColorMap = useMemo(() => assignPnrColors(journeys), [journeys]);
  const diagnostics = useMemo(() => getPnrDiagnostics(journeys), [journeys]);
  const selectedItems = useMemo(() => Array.from(selectedFlights.values()), [selectedFlights]);

  if (!rawResult) return null;

  if (rawResult.noFlightData) {
    return (
      <section className="ticket-results">
        <div className="ta-empty-result ta-empty-result--warning">
          <strong>No Flight Information Found</strong>
          <p>This document does not contain flight information. Upload a boarding pass, e-ticket, or itinerary.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="ticket-results">
      {(rawResult.processingTime || rawResult.costUSD) && (
        <div className="ta-processing-meta">
          {rawResult.processingTime && <span>Processed in {rawResult.processingTime}s</span>}
          {rawResult.costUSD && <span>{rawResult.costUSD}</span>}
        </div>
      )}

      {diagnostics.hasMissingPnr && (
        <div className="ta-notice ta-notice--info">
          <strong>Missing PNRs Detected</strong>
          <p>One or more true PNRs could not be clearly extracted. Use your scanner to read the barcode and edit the PNR field below.</p>
        </div>
      )}

      {diagnostics.differentPnrCount > 1 && (
        <div className="ta-notice ta-notice--cyan">
          <strong>{diagnostics.differentPnrCount} Different PNRs Detected</strong>
        </div>
      )}

      {journeys.map((journey, journeyIndex) => (
        <JourneyResult
          journey={journey}
          journeyIndex={journeyIndex}
          key={`journey-${journeyIndex}`}
          onDateChange={onDateChange}
          onSelectChange={onSelectChange}
          pnrColorMap={pnrColorMap}
          selectedFlights={selectedFlights}
          totalJourneys={journeys.length}
        />
      ))}

      <GroupSearchBar items={selectedItems} onClear={onClearSelection} />
    </section>
  );
}
