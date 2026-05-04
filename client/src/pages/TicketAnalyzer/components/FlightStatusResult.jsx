export default function FlightStatusResult({ result }) {
  if (!result) return null;

  if (result.loading) {
    return <div className="ta-flight-status ta-flight-status--loading">Checking flight status...</div>;
  }

  if (result.error) {
    return <div className="ta-flight-status ta-flight-status--error">{result.error}</div>;
  }

  const stats = result.data?.aiStats;

  if (!stats) {
    return (
      <div className="ta-flight-status ta-flight-status--error">
        {result.data?.error || 'Status unavailable'}
      </div>
    );
  }

  return (
    <div className="ta-flight-status">
      <div
        className="ta-flight-status__banner"
        style={{ background: stats.bannerBg, color: stats.bannerTextCol }}
      >
        {stats.bannerText}
      </div>
      <div className="ta-flight-status__body">
        <div className="ta-flight-status__topline">
          <span>{stats.operatorName}</span>
          <span>{stats.flightDuration}</span>
        </div>
        <div className="ta-flight-status__route">
          <div>
            <strong>{stats.depIata}</strong>
            <span>{stats.depCity}</span>
          </div>
          <div className="ta-flight-status__line" />
          <div>
            <strong>{stats.arrIata}</strong>
            <span>{stats.arrCity}</span>
          </div>
        </div>
        <div className="ta-flight-status__times">
          <div>
            <span>Departure</span>
            <strong>{stats.depActual || stats.depSched}</strong>
            <small>{stats.depDate}</small>
          </div>
          <div>
            <span>Arrival</span>
            <strong>{stats.arrTimeDataPending ? 'Data pending' : stats.arrActual || stats.arrSched}</strong>
            <small>{stats.arrDate}</small>
          </div>
        </div>
        <div className="ta-flight-status__delay" style={{ color: stats.arrDelayColor }}>
          {stats.arrDelay}
        </div>
      </div>
    </div>
  );
}
