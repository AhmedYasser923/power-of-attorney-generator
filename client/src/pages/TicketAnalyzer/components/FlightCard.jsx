import { useEffect, useMemo, useState } from 'react';
import { checkEoc, checkFlightStatus } from '../../../api/ticketAnalyzer.js';
import {
  buildFullDate,
  buildTrackerURLs,
  classifyDate,
  formatLimit,
  getCardId,
  getClaimValueBadge,
  getExpirationState,
  getFlightNumbers,
  getStatusBadge,
  hasFullDate,
  isRescheduled
} from '../ticketAnalyzerUtils.js';
import FlightStatusResult from './FlightStatusResult.jsx';

function DateControl({ dateValue, onDateChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(hasFullDate(dateValue) ? dateValue : '');
  const dateKind = classifyDate(dateValue);

  useEffect(() => {
    if (!editing) setDraft(hasFullDate(dateValue) ? dateValue : '');
  }, [dateValue, editing]);

  if (dateKind === 'missing') {
    return (
      <div className="ta-date-control ta-date-control--missing">
        <span>No date</span>
        <input onChange={(event) => setDraft(event.target.value)} type="date" value={draft} />
        <button disabled={!draft} onClick={() => onDateChange(draft)} type="button">Set</button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="ta-date-control ta-date-control--editing">
        <input onChange={(event) => setDraft(event.target.value)} type="date" value={draft} />
        <button disabled={!draft} onClick={() => { onDateChange(draft); setEditing(false); }} type="button">
          Confirm
        </button>
        <button onClick={() => setEditing(false)} type="button">Cancel</button>
      </div>
    );
  }

  return (
    <div className={`ta-date-control${dateKind === 'partial' ? ' ta-date-control--partial' : ''}`}>
      <span>{dateValue || 'Unknown'}</span>
      <button onClick={() => setEditing(true)} title="Edit date" type="button">Edit</button>
    </div>
  );
}

function TrackerLinks({ dateValue, flightNumber }) {
  const urls = buildTrackerURLs(flightNumber, dateValue);

  if (!urls) return null;

  if (!urls.airportInfo) {
    return (
      <span className="ta-tracker-links ta-tracker-links--disabled">
        <span title="Set a complete date to enable">AirportInfo</span>
        <span>FlightStats</span>
        <span>Flightera</span>
      </span>
    );
  }

  return (
    <span className="ta-tracker-links">
      <a href={urls.airportInfo} rel="noopener noreferrer" target="_blank">AirportInfo</a>
      <a href={urls.flightStats} rel="noopener noreferrer" target="_blank">FlightStats</a>
      <a href={urls.flightera} rel="noopener noreferrer" target="_blank">Flightera</a>
    </span>
  );
}

function ClaimDocuments({ documents }) {
  if (!documents?.length) return null;

  return (
    <details className="ta-doc-panel">
      <summary className="ta-doc-panel__header">
        <span>Mandatory Claim Documents</span>
        <small>{documents.length}</small>
      </summary>
      <div className="ta-doc-list">
        {documents.map((document, index) => {
          const noDocsRequired = document.reqs === 'No documents required';
          return (
            <div className={`ta-doc-item${noDocsRequired ? ' ta-doc-item--clear' : ''}`} key={`${document.airline}-${index}`}>
              <div className="ta-doc-item__top">
                <div>
                  {document.role && <span className="ta-doc-role">{document.role}</span>}
                  <strong>{document.airline}</strong>
                </div>
                {document.hq && (
                  <span className="ta-doc-limit">
                    {document.hq} ({document.limit || 'N/A'})
                  </span>
                )}
              </div>
              <p>{noDocsRequired ? 'No docs required' : document.reqs}</p>
            </div>
          );
        })}
      </div>
    </details>
  );
}

function PassengerTickets({ tickets }) {
  if (!Array.isArray(tickets) || tickets.length === 0) return null;

  return (
    <details className="ta-ticket-panel">
      <summary className="ta-ticket-panel__header">
        <span>Ticket Numbers Used</span>
        <small>{tickets.length}</small>
      </summary>
      <div className="ta-ticket-list">
        {tickets.map((ticket, index) => (
          <span className="ta-ticket-number" key={`${ticket.passengerName}-${ticket.ticketNumber}-${index}`}>
            <strong>{ticket.passengerName || 'Unknown'}:</strong> {ticket.ticketNumber || 'N/A'}
          </span>
        ))}
      </div>
    </details>
  );
}

function EocStatus({ eoc }) {
  if (eoc.loading) {
    return <span className="ta-eoc ta-eoc--loading">Checking EOC...</span>;
  }

  if (eoc.incomplete) {
    return <span className="ta-eoc ta-eoc--incomplete">Date incomplete - no EOC check</span>;
  }

  if (eoc.error) {
    return <span className="ta-eoc ta-eoc--danger">EOC check failed</span>;
  }

  if (eoc.events?.length) {
    return <span className="ta-eoc ta-eoc--danger">{eoc.events.length > 1 ? `${eoc.events.length} EOCs found` : 'EOC found'}</span>;
  }

  return <span className="ta-eoc ta-eoc--clear">No EOC found</span>;
}

function formatDistance(distance) {
  const value = String(distance || '').trim();

  if (!value) return '';
  if (/km$/i.test(value)) return value.toUpperCase();

  return `${value} KM`;
}

export default function FlightCard({
  appliedYear,
  flight,
  journeyIndex,
  legIndex,
  onSelectChange,
  pnrColorClass,
  routeIndex,
  selected,
  yearApplySignal
}) {
  const flightNumbers = useMemo(() => getFlightNumbers(flight), [flight]);
  const cardId = useMemo(
    () => getCardId({ journeyIndex, routeIndex, legIndex, flight }),
    [flight, journeyIndex, legIndex, routeIndex]
  );
  const [dateValue, setDateValue] = useState(flight.date || '');
  const [pnr, setPnr] = useState(
    flight.pnr && !String(flight.pnr).toLowerCase().includes('scan') && flight.pnr !== 'Not Provided'
      ? flight.pnr
      : ''
  );
  const [eoc, setEoc] = useState({ loading: false, events: [], incomplete: true });
  const [statusResults, setStatusResults] = useState({});

  const statusBadge = getStatusBadge(flight);
  const rescheduled = isRescheduled(flight);
  const isStopover = flightNumbers.length > 1 && !flight.isCodeshare;
  const expiration = getExpirationState(flight, dateValue);
  const claimValue = getClaimValueBadge(flight);
  const legEligible = flight.ec261Leg?.status && !flight.ec261Leg.status.toLowerCase().includes('not');
  const primaryFlightNumber = flightNumbers[0] || 'N/A';
  const flightNumberList = flightNumbers.length ? flightNumbers.join(' / ') : 'N/A';
  const operatorLabel = flight.marketingAirline === flight.operatingAirline || !flight.operatingAirline
    ? flight.operatingAirline || flight.marketingAirline || 'Unknown airline'
    : `${flight.marketingAirline || 'Unknown'} -> ${flight.operatingAirline}`;
  const distanceLabel = formatDistance(flight.distanceKm);
  const originLimit = formatLimit(flight.ec261Leg?.claimExpiration?.originYears);
  const destinationLimit = formatLimit(flight.ec261Leg?.claimExpiration?.destinationYears);
  const selectedPayload = useMemo(() => ({
    date: dateValue,
    flightNumbers,
    id: cardId
  }), [cardId, dateValue, flightNumbers]);

  useEffect(() => {
    if (!yearApplySignal || !appliedYear || classifyDate(dateValue) !== 'partial') return;

    const fullDate = buildFullDate(dateValue, appliedYear);
    if (fullDate) setDateValue(fullDate);
  }, [appliedYear, dateValue, yearApplySignal]);

  useEffect(() => {
    if (selected) {
      onSelectChange(selectedPayload, true);
    }
  }, [onSelectChange, selected, selectedPayload]);

  useEffect(() => {
    let active = true;

    if (!hasFullDate(dateValue)) {
      setEoc({ loading: false, events: [], incomplete: true });
      return () => {
        active = false;
      };
    }

    setEoc({ loading: true, events: [], incomplete: false });

    checkEoc({
      date: dateValue,
      originIata: flight.originIata,
      destIata: flight.destinationIata,
      originCountry: flight.originCountry,
      destCountry: flight.destinationCountry
    })
      .then((payload) => {
        if (!active) return;

        setEoc({
          loading: false,
          events: payload.eocFound ? payload.events || [] : [],
          incomplete: false
        });
      })
      .catch(() => {
        if (active) setEoc({ loading: false, events: [], error: true, incomplete: false });
      });

    return () => {
      active = false;
    };
  }, [dateValue, flight.destinationCountry, flight.destinationIata, flight.originCountry, flight.originIata]);

  const runStatusCheck = async (flightNumber) => {
    if (!hasFullDate(dateValue)) {
      setStatusResults((current) => ({
        ...current,
        [flightNumber]: { error: 'Set a complete date first.' }
      }));
      return;
    }

    setStatusResults((current) => ({
      ...current,
      [flightNumber]: { loading: true }
    }));

    try {
      const payload = await checkFlightStatus({
        flightNumber,
        date: dateValue,
        origin: flight.originIata,
        destination: flight.destinationIata
      });

      setStatusResults((current) => ({
        ...current,
        [flightNumber]: { data: payload }
      }));
    } catch (err) {
      setStatusResults((current) => ({
        ...current,
        [flightNumber]: { error: err.message }
      }));
    }
  };

  return (
    <article
      className={[
        'ta-flight-card',
        selected ? 'is-selected' : '',
        eoc.events?.length ? 'eoc-alert-active' : '',
        expiration.expired ? 'expired-alert-active' : ''
      ].filter(Boolean).join(' ')}
      style={{ opacity: statusBadge?.opacity || 1 }}
    >
      <div className="ta-flight-card__topbar">
        <label className="ta-flight-card__select">
          <input
            checked={selected}
            onChange={(event) => onSelectChange(selectedPayload, event.target.checked)}
            type="checkbox"
          />
          <span>{primaryFlightNumber}</span>
        </label>
        <span className="ta-flight-card__sep">/</span>
        <span className="ta-flight-card__operator">{operatorLabel}</span>
      </div>

      {statusBadge && (
        <div className={`ta-status-badge ta-status-badge--${statusBadge.tone}`}>
          {statusBadge.label}
          {rescheduled && (
            <span>
              {flight.originalDepartureTime && flight.originalDepartureTime !== '--:--'
                ? ` Dep: ${flight.originalDepartureTime} -> ${flight.departureTime || '--:--'}`
                : ''}
              {flight.originalArrivalTime && flight.originalArrivalTime !== '--:--'
                ? ` Arr: ${flight.originalArrivalTime} -> ${flight.arrivalTime || '--:--'}`
                : ''}
            </span>
          )}
        </div>
      )}

      {isStopover && (
        <div className="ta-stopover-warning">
          This flight has a stopover. The connecting airport was not shown on the ticket.
        </div>
      )}

      <div className="ta-flight-card__route">
        <div className="ta-route-point">
          <strong>{flight.originIata || '???'}</strong>
          <span>{flight.originName || flight.originCity || ''}</span>
          <small>{flight.originCity || ''}{flight.originCountry ? `, ${flight.originCountry}` : ''}</small>
        </div>
        <div className="ta-flight-card__route-line">
          {distanceLabel && <span>{distanceLabel}</span>}
          <div><b aria-hidden="true">AIR</b></div>
        </div>
        <div className="ta-route-point">
          <strong>{flight.destinationIata || '???'}</strong>
          <span>{flight.destinationName || flight.destinationCity || ''}</span>
          <small>{flight.destinationCity || ''}{flight.destinationCountry ? `, ${flight.destinationCountry}` : ''}</small>
        </div>
      </div>

      <div className="ta-flight-card__times">
        <div>
          <strong>{flight.departureTime || '--:--'}</strong>
        </div>
        <div>
          <strong>{flight.arrivalTime || '--:--'}</strong>
        </div>
      </div>

      <div className="ta-flight-card__claim-limits">
        <span className={originLimit === 'N/A' ? 'is-muted' : ''}>Limit: {originLimit}</span>
        <span className={destinationLimit === 'N/A' ? 'is-muted' : ''}>Limit: {destinationLimit}</span>
      </div>

      <div className="ta-flight-card__date-row">
        <DateControl dateValue={dateValue} onDateChange={setDateValue} />
      </div>

      <div className="ta-flight-card__details">
        <div className="ta-detail">
          <span>PNR</span>
          <strong className={`ta-pnr ${pnrColorClass}`}>
            <span
              className="ta-pnr__editable"
              contentEditable
              onBlur={(event) => setPnr(event.currentTarget.textContent.trim())}
              role="textbox"
              spellCheck="false"
              suppressContentEditableWarning
            >
              {pnr}
            </span>
          </strong>
        </div>
        <div className="ta-detail">
          <span>Airline</span>
          <strong>{operatorLabel}</strong>
        </div>
        {flight.printedReference && flight.printedReference !== 'Not Provided' && flight.printedReference !== pnr && (
          <span className="ta-printed-ref">Printed Ref: {flight.printedReference}</span>
        )}
      </div>

      <div className="ta-flight-card__actions">
        <span className="ta-flight-number-list">
          {flightNumberList}
          {isStopover && <span className="ta-stopover-chip">Stopover</span>}
        </span>
        {flightNumbers.map((flightNumber) => (
          <span className="ta-flight-action-set" key={flightNumber}>
            <button onClick={() => runStatusCheck(flightNumber)} type="button">
              {flightNumber} Stats
            </button>
            <TrackerLinks dateValue={dateValue} flightNumber={flightNumber} />
          </span>
        ))}
      </div>

      <PassengerTickets tickets={flight.passengerTickets} />
      <ClaimDocuments documents={flight.claimDocuments} />

      <div className="ta-flight-card__footer">
        <EocStatus eoc={eoc} />
        <div className="ta-flight-card__badges">
          {flight.ec261Leg?.status && (
            <span className={`ta-leg-status${legEligible ? ' ta-leg-status--eligible' : ' ta-leg-status--not-eligible'}`}>
              {flight.ec261Leg.status}
            </span>
          )}
          {claimValue && <span className="ta-claim-value">{claimValue}</span>}
          <span className={`ta-expiration ta-expiration--${expiration.tone}`} title={expiration.title || ''}>
            {expiration.label}
          </span>
        </div>
      </div>

      {eoc.events?.length > 0 && (
        <div className="ta-eoc-details">
          <strong>{eoc.events.length > 1 ? 'Multiple extraordinary circumstances detected' : 'Extraordinary circumstance detected'}</strong>
          {eoc.events.map((event, index) => (
            <dl key={`${event.category}-${event.event}-${index}`}>
              <dt>Category</dt>
              <dd>{event.category}</dd>
              <dt>Event</dt>
              <dd>{event.event}</dd>
              <dt>Location</dt>
              <dd>{event.location}</dd>
              <dt>Decision</dt>
              <dd>{event.decision}</dd>
            </dl>
          ))}
        </div>
      )}

      {Object.entries(statusResults).map(([flightNumber, result]) => (
        <FlightStatusResult key={flightNumber} result={result} />
      ))}
    </article>
  );
}
