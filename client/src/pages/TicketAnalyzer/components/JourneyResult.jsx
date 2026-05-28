import {
  getCardId,
  getPnrColorClass
} from '../ticketAnalyzerUtils.js';
import FlightCard from './FlightCard.jsx';

function Ec261Summary({ journey }) {
  const eligibleLegs = [];
  const ineligibleLegs = [];

  (journey.routes || []).forEach((route) => {
    (route.legs || []).forEach((leg) => {
      if (!leg.ec261Leg?.status) return;

      const summary = `${leg.originIata || '?'} -> ${leg.destinationIata || '?'}: ${leg.ec261Leg.reason}`;
      const eligible = !leg.ec261Leg.status.toLowerCase().includes('not');

      if (eligible) eligibleLegs.push(summary);
      else ineligibleLegs.push(summary);
    });
  });

  if (eligibleLegs.length > 0 && ineligibleLegs.length > 0) {
    return (
      <div className="ta-ec-summary ta-ec-summary--mixed">
        <strong>Overall claim: mixed eligibility</strong>
        <p>This journey contains a mix of eligible and legally ineligible flight legs.</p>
        <div className="ta-ec-summary__lists">
          <ul>
            {eligibleLegs.map((leg) => <li key={leg}>{leg}</li>)}
          </ul>
          <ul>
            {ineligibleLegs.map((leg) => <li key={leg}>{leg}</li>)}
          </ul>
        </div>
      </div>
    );
  }

  const status = eligibleLegs.length > 0
    ? 'Eligible'
    : ineligibleLegs.length > 0
      ? 'Not eligible'
      : journey.ec261?.status || 'Unknown';

  return (
    <div className={`ta-ec-summary${eligibleLegs.length > 0 ? ' ta-ec-summary--eligible' : ' ta-ec-summary--not-eligible'}`}>
      <strong>Overall claim: {status}</strong>
      <p>{journey.ec261?.reason || 'Eligibility was evaluated for the extracted route.'}</p>
    </div>
  );
}

export default function JourneyResult({
  journey,
  journeyIndex,
  onDateChange,
  onSelectChange,
  pnrColorMap,
  selectedFlights,
  totalJourneys
}) {
  let cardCounter = 0;

  return (
    <section className="ta-journey">
      {totalJourneys > 1 && <h3>Ticket / Journey {journeyIndex + 1}</h3>}
      {(journey.ec261 || journey.routes?.length > 0) && <Ec261Summary journey={journey} />}

      {(journey.routes || []).length === 0 ? (
        <div className="ta-empty-result">No flight routes detected.</div>
      ) : (journey.routes || []).map((route, routeIndex) => (
        <div className="ta-route" key={`${route.type || 'route'}-${routeIndex}`}>
          <h4>{route.type || 'Flight Route'}</h4>
          {(route.legs || []).map((flight, legIndex) => {
            const cardId = getCardId({ journeyIndex, routeIndex, legIndex, flight });
            const pnrColorClass = getPnrColorClass(flight.pnr, pnrColorMap);
            const animationIndex = cardCounter++;

            return (
              <FlightCard
                animationIndex={animationIndex}
                flight={flight}
                journeyIndex={journeyIndex}
                key={cardId}
                legIndex={legIndex}
                onDateChange={onDateChange}
                onSelectChange={onSelectChange}
                pnrColorClass={pnrColorClass}
                routeIndex={routeIndex}
                selected={selectedFlights.has(cardId)}
              />
            );
          })}
        </div>
      ))}
    </section>
  );
}
