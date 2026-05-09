import { openTrackerUrls } from '../ticketAnalyzerUtils.js';

const GLOBE_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <path d="M2 12h20" />
  </svg>
);

const CHART_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" />
    <path d="m19 9-5 5-4-4-3 3" />
  </svg>
);

const PLANE_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
  </svg>
);

const SEARCH_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

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
      <div className="ta-group-search__count">
        {PLANE_ICON}
        <strong>{items.length}</strong>
        <span>selected</span>
      </div>

      <div className="ta-group-search__divider" />

      <div className="ta-group-search__trackers">
        <button className="ta-group-search__all" onClick={() => search('all')} type="button">
          {SEARCH_ICON} Search All
        </button>
        <button className="ta-group-search__tracker" onClick={() => search('airportinfo')} type="button">
          {GLOBE_ICON} AirportInfo
        </button>
        <button className="ta-group-search__tracker" onClick={() => search('flightstats')} type="button">
          {CHART_ICON} FlightStats
        </button>
        <button className="ta-group-search__tracker" onClick={() => search('flightera')} type="button">
          {PLANE_ICON} Flightera
        </button>
      </div>

      <button className="ta-group-search__deselect" onClick={onClear} type="button">
        Deselect
      </button>
    </div>
  );
}
