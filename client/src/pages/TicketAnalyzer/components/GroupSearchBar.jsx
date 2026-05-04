import { openTrackerUrls } from '../ticketAnalyzerUtils.js';

export default function GroupSearchBar({ items, onClear }) {
  if (items.length === 0) return null;

  const search = (tracker) => {
    const skipped = openTrackerUrls(items, tracker);

    if (skipped > 0) {
      window.alert(`${skipped} flight(s) skipped. Set a complete date first.`);
    }
  };

  return (
    <div className="ta-group-search">
      <span>{items.length} flight{items.length > 1 ? 's' : ''} selected</span>
      <button onClick={() => search('all')} type="button">Search All Trackers</button>
      <button onClick={() => search('airportinfo')} type="button">AirportInfo</button>
      <button onClick={() => search('flightstats')} type="button">FlightStats</button>
      <button onClick={() => search('flightera')} type="button">Flightera</button>
      <button className="ta-group-search__clear" onClick={onClear} type="button">Deselect All</button>
    </div>
  );
}
