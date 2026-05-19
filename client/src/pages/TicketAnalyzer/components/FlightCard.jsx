import { useEffect, useId, useMemo, useState } from 'react';
import { checkEoc, checkFlightStatus } from '../../../api/ticketAnalyzer.js';
import {
  buildFullDate,
  buildTrackerURLs,
  classifyDate,
  formatLimit,
  formatMinutes,
  getCardId,
  getClaimValueBadge,
  getDateSourceBadge,
  getExpirationState,
  getFlightNumbers,
  getStatusBadge,
  hasFullDate,
  isRescheduled,
  silentCopy,
  withAirportSuffix
} from '../ticketAnalyzerUtils.js';
import FlightStatusResult from './FlightStatusResult.jsx';

const CALENDAR_ICON = (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M8 2v4" />
    <path d="M16 2v4" />
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18" />
  </svg>
);

const CHECK_ICON = (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="m5 12 4 4L19 6" />
  </svg>
);

const X_ICON = (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

function DateControl({ dateValue, onDateChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(hasFullDate(dateValue) ? dateValue : '');
  const dateKind = classifyDate(dateValue);
  const inputId = useId();

  useEffect(() => {
    if (!editing) setDraft(hasFullDate(dateValue) ? dateValue : '');
  }, [dateValue, editing]);

  const startEditing = () => {
    setDraft(hasFullDate(dateValue) ? dateValue : '');
    setEditing(true);
  };

  const saveDraft = () => {
    if (!draft) return;
    onDateChange(draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="ta-date-control ta-date-control--editing">
        <label htmlFor={inputId}>Date</label>
        <div className="ta-date-control__body">
          <input id={inputId} onChange={(event) => setDraft(event.target.value)} type="date" value={draft} />
          <button aria-label="Save date" disabled={!draft} onClick={saveDraft} title="Save date" type="button">
            {CHECK_ICON}
          </button>
          <button aria-label="Cancel date edit" onClick={() => setEditing(false)} title="Cancel" type="button">
            {X_ICON}
          </button>
        </div>
      </div>
    );
  }

  const dateLabel = dateKind === 'missing' ? 'No date' : dateValue || 'Unknown';

  return (
    <div className={`ta-date-control ta-date-control--${dateKind}`}>
      <span>Date</span>
      <div className="ta-date-control__body">
        <strong>{dateLabel}</strong>
        <button
          aria-label={dateKind === 'missing' ? 'Set flight date' : 'Edit flight date'}
          onClick={startEditing}
          title={dateKind === 'missing' ? 'Set date' : 'Edit date'}
          type="button"
        >
          {CALENDAR_ICON}
        </button>
      </div>
    </div>
  );
}

function TrackerLinks({ dateValue, flightNumber }) {
  const urls = buildTrackerURLs(flightNumber, dateValue);

  if (!urls) return null;

  if (!urls.airportInfo) {
    return (
      <span className="ta-tracker-menu ta-tracker-menu--disabled" title="Set a complete date to enable trackers">
        Trackers unavailable
      </span>
    );
  }

  return (
    <details className="ta-tracker-menu">
      <summary>Trackers</summary>
      <span className="ta-tracker-menu__links">
        <a href={urls.airportInfo} rel="noopener noreferrer" target="_blank">AirportInfo</a>
        <a href={urls.flightStats} rel="noopener noreferrer" target="_blank">FlightStats</a>
        <a href={urls.flightera} rel="noopener noreferrer" target="_blank">Flightera</a>
      </span>
    </details>
  );
}

function FlightCardDisclosure({ children, count, meta, title, tone = 'neutral' }) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();

  return (
    <section className={`ta-flight-disclosure ta-flight-disclosure--${tone}${expanded ? ' is-expanded' : ''}`}>
      <button
        aria-controls={contentId}
        aria-expanded={expanded}
        className="ta-flight-disclosure__trigger"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <span className="ta-flight-disclosure__chevron" aria-hidden="true">&gt;</span>
        <span className="ta-flight-disclosure__title">{title}</span>
        {meta && <span className="ta-flight-disclosure__meta">{meta}</span>}
        {typeof count === 'number' && <span className="ta-flight-disclosure__count">{count}</span>}
      </button>
      <div className="ta-flight-disclosure__content" hidden={!expanded} id={contentId}>
        {children}
      </div>
    </section>
  );
}

function isNoDocsRequired(document) {
  return String(document.reqs || '').trim().toLowerCase() === 'no documents required';
}

function ClaimDocuments({ documents }) {
  if (!documents?.length) return null;

  const requiredDocumentCount = documents.filter((document) => {
    const requirements = String(document.reqs || '').trim();
    return requirements && !isNoDocsRequired(document);
  }).length;
  const documentLabel = documents.length === 1 ? 'document' : 'documents';
  const meta = requiredDocumentCount > 0
    ? `${requiredDocumentCount} of ${documents.length} required`
    : `${documents.length} ${documentLabel} - no docs required`;

  return (
    <FlightCardDisclosure
      meta={meta}
      title="Claim documents"
      tone={requiredDocumentCount > 0 ? 'warning' : 'clear'}
    >
      <div className="ta-doc-list">
        {documents.map((document, index) => {
          const noDocsRequired = isNoDocsRequired(document);
          return (
            <div className={`ta-doc-item${noDocsRequired ? ' ta-doc-item--clear' : ''}`} key={`${document.airline}-${index}`}>
              <div className="ta-doc-item__top">
                <div>
                  {document.role && <span className="ta-doc-role">{document.role}</span>}
                  <strong>{document.airline}</strong>
                  <div className="ta-doc-chips">
                    {document.iata && <span className="ta-doc-chip ta-doc-chip--iata">IATA {document.iata}</span>}
                    {document.icao && <span className="ta-doc-chip ta-doc-chip--icao">ICAO {document.icao}</span>}
                    {document.ticketNumberCanReplacePnr && (
                      <span className="ta-doc-chip ta-doc-chip--ticket-pnr">Ticket # replaces PNR</span>
                    )}
                    {document.oneTimeSubmission && (
                      <span className="ta-doc-chip ta-doc-chip--one-time">One-time submission</span>
                    )}
                    {document.ceasedOperations && (
                      <span className="ta-doc-chip ta-doc-chip--ceased">Ceased operations</span>
                    )}
                  </div>
                </div>
                {document.hq && (
                  <span className="ta-doc-limit">
                    {document.hq} ({document.limit || 'N/A'})
                  </span>
                )}
              </div>
              <p>{noDocsRequired ? 'No docs required' : document.reqs || 'Requirements not specified'}</p>
              {document.claimNote && (
                <p className="ta-doc-claim-note">{document.claimNote}</p>
              )}
            </div>
          );
        })}
      </div>
    </FlightCardDisclosure>
  );
}

function PassengerTickets({ tickets }) {
  const [copiedKey, setCopiedKey] = useState(null);

  if (!Array.isArray(tickets) || tickets.length === 0) return null;

  const handleCopy = async (text, key) => {
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1200);
    } catch {
      // ignore copy failures silently
    }
  };

  return (
    <FlightCardDisclosure meta={`${tickets.length} ${tickets.length === 1 ? 'ticket' : 'tickets'}`} title="Ticket numbers">
      <div className="ta-ticket-list">
        {tickets.map((ticket, index) => {
          const key = `${ticket.passengerName}-${ticket.ticketNumber}-${index}`;
          const passengerName = ticket.passengerName || 'Unknown';
          const ticketNumber = ticket.ticketNumber || 'N/A';
          const copyText = `${passengerName}: ${ticketNumber}`;
          const isCopied = copiedKey === key;
          const disabled = !ticket.ticketNumber && !ticket.passengerName;
          return (
            <button
              type="button"
              className={`ta-ticket-number${isCopied ? ' ta-ticket-number--copied' : ''}`}
              key={key}
              onClick={() => handleCopy(copyText, key)}
              disabled={disabled}
              title={disabled ? 'Nothing to copy' : `Copy "${copyText}"`}
            >
              <strong
                className="ta-copy-target"
                onClick={(event) => { event.stopPropagation(); silentCopy(passengerName); }}
                title={`Copy passenger name "${passengerName}"`}
              >{passengerName}:</strong> {ticketNumber}
            </button>
          );
        })}
      </div>
    </FlightCardDisclosure>
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

function RescheduleSummary({ flight }) {
  const change = flight.rescheduleChange;
  const legacyDep = !change && flight.originalDepartureTime && flight.originalDepartureTime !== '--:--'
    ? `${flight.originalDepartureTime} -> ${flight.departureTime || '--:--'}`
    : null;
  const legacyArr = !change && flight.originalArrivalTime && flight.originalArrivalTime !== '--:--'
    ? `${flight.originalArrivalTime} -> ${flight.arrivalTime || '--:--'}`
    : null;

  if (!change && !legacyDep && !legacyArr) return null;

  if (!change) {
    return (
      <span className="ta-reschedule-summary ta-reschedule-summary--legacy">
        {legacyDep && <span> Dep: {legacyDep}</span>}
        {legacyArr && <span> Arr: {legacyArr}</span>}
      </span>
    );
  }

  const { before, after, dateChanged, depChanged, arrChanged, departureDelayMinutes, arrivalDelayMinutes, suspect } = change;
  const depDelta = formatMinutes(departureDelayMinutes);
  const arrDelta = formatMinutes(arrivalDelayMinutes);
  const arrIsEC261 = arrivalDelayMinutes !== null && arrivalDelayMinutes >= 180;

  return (
    <span className="ta-reschedule-summary">
      {dateChanged && before.d && after.d && (
        <span className="ta-reschedule-row"> Date: {before.d} {'->'} {after.d}</span>
      )}
      {depChanged && before.t && after.t && (
        <span className="ta-reschedule-row">
          {' '}Dep: {before.t} {'->'} {after.t}
          {depDelta && <span className="ta-reschedule-delta"> ({depDelta})</span>}
        </span>
      )}
      {arrChanged && before.a && after.a && (
        <span className="ta-reschedule-row">
          {' '}Arr: {before.a} {'->'} {after.a}
          {arrDelta && (
            <span className={`ta-reschedule-delta ta-reschedule-delta--arrival${arrIsEC261 ? ' ta-reschedule-delta--ec261' : ''}`}>
              {' '}({arrDelta}{arrIsEC261 ? ' - >=3h - likely EC261 eligible' : ''})
            </span>
          )}
        </span>
      )}
      {suspect && (
        <span className="ta-reschedule-suspect"> Verify - large gap</span>
      )}
    </span>
  );
}

function formatDistance(distance) {
  const value = String(distance || '').trim();

  if (!value) return '';
  if (/km$/i.test(value)) return value.toUpperCase();

  return `${value} KM`;
}

function formatPnr(value) {
  const pnr = String(value || '').trim();
  const normalized = pnr.toLowerCase();

  if (!pnr || normalized.includes('scan') || normalized === 'not provided' || normalized === 'unknown' || normalized === 'n/a') {
    return '-';
  }

  return pnr.toUpperCase();
}

function formatPrintedReference(value) {
  const reference = String(value || '').trim();
  const normalized = reference.toLowerCase();

  if (!reference || normalized === 'not provided' || normalized === 'unknown' || normalized === 'n/a') {
    return '-';
  }

  return reference;
}

export default function FlightCard({
  animationIndex = 0,
  appliedYear,
  flight,
  journeyIndex,
  legIndex,
  onSelectChange,
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
  const [eoc, setEoc] = useState({ loading: false, events: [], incomplete: true });
  const [statusResults, setStatusResults] = useState({});

  const statusBadge = getStatusBadge(flight);
  const rescheduled = isRescheduled(flight);
  const isStopover = flightNumbers.length > 1 && !flight.isCodeshare;
  const expiration = getExpirationState(flight, dateValue);
  const claimValue = getClaimValueBadge(flight);
  const legEligible = flight.ec261Leg?.status && !flight.ec261Leg.status.toLowerCase().includes('not');
  const marketingAirlineLabel = flight.marketingAirline || flight.operatingAirline || 'Unknown airline';
  const operatingAirlineLabel = flight.operatingAirline || '';
  const hasDifferentOperatingAirline = Boolean(
    operatingAirlineLabel &&
    flight.marketingAirline &&
    marketingAirlineLabel !== operatingAirlineLabel
  );
  const distanceLabel = formatDistance(flight.distanceKm);
  const originLimit = formatLimit(flight.ec261Leg?.claimExpiration?.originYears);
  const destinationLimit = formatLimit(flight.ec261Leg?.claimExpiration?.destinationYears);
  const displayPnr = formatPnr(flight.pnr);
  const printedReference = formatPrintedReference(flight.printedReference);
  const showPrintedReference = printedReference !== '-' && printedReference.toUpperCase() !== displayPnr.toUpperCase();
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
        expiration.expired ? 'expired-alert-active' : '',
        classifyDate(dateValue) !== 'full' ? 'year-missing-active' : ''
      ].filter(Boolean).join(' ')}
      style={{
        '--card-opacity': statusBadge?.opacity || 1,
        animationDelay: `${animationIndex * 60}ms`
      }}
    >
      <div className="ta-flight-card__header">
        <label className="ta-flight-card__select">
          <input
            checked={selected}
            onChange={(event) => onSelectChange(selectedPayload, event.target.checked)}
            type="checkbox"
          />
          <span>Select flight</span>
        </label>
        {statusBadge && (
          <div className={`ta-status-badge ta-status-badge--${statusBadge.tone}`}>
            {statusBadge.label}
            {rescheduled && <RescheduleSummary flight={flight} />}
          </div>
        )}
      </div>

      {isStopover && (
        <div className="ta-stopover-warning">
          This flight has a stopover. The connecting airport was not shown on the ticket.
        </div>
      )}

      <div className="ta-flight-card__route">
        <div className="ta-route-point">
          <strong>{flight.originIata || '???'}</strong>
          {(() => {
            const displayed = withAirportSuffix(flight.originName || flight.originCity);
            return displayed ? (
              <span className="ta-copy-target" onClick={() => silentCopy(displayed)}>{displayed}</span>
            ) : <span />;
          })()}
          <small>
            {flight.originCity || ''}
            {flight.originCountry && <>{flight.originCity ? ', ' : ''}<span className="ta-copy-target" onClick={() => silentCopy(flight.originCountry)}>{flight.originCountry}</span></>}
          </small>
        </div>
        <div className="ta-flight-card__route-line">
          {distanceLabel && <span>{distanceLabel}</span>}
          <div><b aria-hidden="true">AIR</b></div>
        </div>
        <div className="ta-route-point">
          <strong>{flight.destinationIata || '???'}</strong>
          {(() => {
            const displayed = withAirportSuffix(flight.destinationName || flight.destinationCity);
            return displayed ? (
              <span className="ta-copy-target" onClick={() => silentCopy(displayed)}>{displayed}</span>
            ) : <span />;
          })()}
          <small>
            {flight.destinationCity || ''}
            {flight.destinationCountry && <>{flight.destinationCity ? ', ' : ''}<span className="ta-copy-target" onClick={() => silentCopy(flight.destinationCountry)}>{flight.destinationCountry}</span></>}
          </small>
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

      <div className="ta-flight-card__claim-limits" aria-label="Claim limitation periods">
        <span className={originLimit === 'N/A' ? 'is-muted' : ''}>
          <strong>{originLimit}</strong>
        </span>
        <span className={destinationLimit === 'N/A' ? 'is-muted' : ''}>
          <strong>{destinationLimit}</strong>
        </span>
      </div>

      <div className="ta-flight-card__claim-row">
        <div className="ta-flight-card__date-cell">
          <DateControl dateValue={dateValue} onDateChange={setDateValue} />
          {(() => {
            const dateSourceBadge = getDateSourceBadge(flight);
            return (
              <span
                className={`ta-status-badge ta-status-badge--${dateSourceBadge.tone} ta-date-source-badge`}
                title="Source of the year used for this date"
              >
                {dateSourceBadge.label}
              </span>
            );
          })()}
        </div>
        <div className="ta-flight-card__claim-summary">
          {flight.ec261Leg?.status && (
            <span className={`ta-leg-status${legEligible ? ' ta-leg-status--eligible' : ' ta-leg-status--not-eligible'}`}>
              {flight.ec261Leg.status}
            </span>
          )}
          {claimValue && <span className="ta-claim-value">{claimValue}</span>}
        </div>
      </div>

      <div className="ta-flight-card__details">
        <div className="ta-detail ta-detail--airline">
          <span>Airline</span>
          <strong>{marketingAirlineLabel}</strong>
        </div>
        {hasDifferentOperatingAirline && (
          <div className="ta-detail">
            <span>Operated by</span>
            <strong>{operatingAirlineLabel}</strong>
          </div>
        )}
        <div className="ta-detail">
          <span>PNR</span>
          <strong className={displayPnr === '-' ? 'is-muted' : ''}>{displayPnr}</strong>
        </div>
        {showPrintedReference && (
          <div className="ta-detail">
            <span>Printed ref</span>
            <strong>{printedReference}</strong>
          </div>
        )}
      </div>

      {flightNumbers.length > 0 && (
        <div className="ta-flight-card__actions">
          <div className="ta-flight-actions-list">
            {flightNumbers.map((flightNumber, index) => (
              <div className="ta-flight-action-row" key={flightNumber}>
                <span className="ta-flight-action-row__label">
                  <strong>{flightNumber}</strong>
                  {flightNumbers.length > 1 && (
                    <small>{index === 0 ? 'Primary' : isStopover ? 'Stopover' : flight.isCodeshare ? 'Codeshare' : 'Additional'}</small>
                  )}
                </span>
                <span className="ta-flight-action-row__disabled-action" title="API key expired">
                  <button disabled type="button">
                    Cirium API
                  </button>
                </span>
                <TrackerLinks dateValue={dateValue} flightNumber={flightNumber} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ta-flight-card__evidence">
        <PassengerTickets tickets={flight.passengerTickets} />
        <ClaimDocuments documents={flight.claimDocuments} />
      </div>

      <div className="ta-flight-card__footer">
        <EocStatus eoc={eoc} />
        <span className={`ta-expiration ta-expiration--${expiration.tone}`} title={expiration.title || ''}>
          {expiration.label}
        </span>
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
