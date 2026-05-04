function TimeBlock({ align = 'left', label, time, date, zone }) {
  return (
    <div className={`flight-stats-time-block flight-stats-time-block--${align}`}>
      <span>
        {label}
        {zone && <small>{zone}</small>}
      </span>
      <strong>{time || '--:--'}</strong>
      {date && <em>{date}</em>}
    </div>
  );
}

export default function FlightStatusCard({ flightNumber, result }) {
  if (!result) return null;

  if (result.loading) {
    return <div className="flight-stats-status flight-stats-status--loading">Searching Cirium status data...</div>;
  }

  if (result.error) {
    return <div className="flight-stats-status flight-stats-status--error">{result.error}</div>;
  }

  const stats = result.data?.aiStats;

  if (!stats) {
    return (
      <div className="flight-stats-status flight-stats-status--error">
        {result.data?.error || 'Status unavailable.'}
      </div>
    );
  }

  const cancelled = stats.rawStatus === 'C';
  const diverted = stats.rawStatus === 'D' && stats.divertedTo;

  return (
    <article className="flight-stats-status">
      <div
        className="flight-stats-status__banner"
        style={{ background: stats.bannerBg, color: stats.bannerTextCol }}
      >
        {stats.bannerText} {flightNumber ? `(${flightNumber})` : ''}
      </div>

      <div className="flight-stats-status__body">
        <div className="flight-stats-status__topline">
          <span>{stats.operatorName || 'Unknown operator'}</span>
          <span>{stats.flightDuration || '--h --m'}</span>
        </div>

        <div className="flight-stats-status__route">
          <div>
            <strong>{stats.depIata || 'N/A'}</strong>
            <span>{stats.depCity || stats.depName || ''}</span>
            {stats.depName && <small>{stats.depName}</small>}
          </div>
          <div className="flight-stats-status__line" />
          <div>
            <strong>{stats.arrIata || 'N/A'}</strong>
            <span>{stats.arrCity || stats.arrName || ''}</span>
            {stats.arrName && <small>{stats.arrName}</small>}
          </div>
        </div>

        <div className="flight-stats-times">
          <section>
            <h2>Departure Gate</h2>
            <TimeBlock
              date={stats.depDate}
              label="Scheduled"
              time={stats.depSched}
              zone={stats.depSchedZone}
            />
            <TimeBlock
              label={stats.depActualLabel || 'Actual'}
              time={stats.depActual}
              zone={stats.depActualZone}
            />
          </section>

          <section className={cancelled ? 'is-cancelled' : ''}>
            <h2>Arrival Gate</h2>
            <TimeBlock
              align="right"
              date={stats.arrDate}
              label="Scheduled"
              time={stats.arrSched}
              zone={stats.arrSchedZone}
            />
            {cancelled ? (
              <div className="flight-stats-cancelled">Flight did not operate</div>
            ) : stats.arrTimeDataPending ? (
              <div className="flight-stats-pending">
                <strong>Data Pending</strong>
                <span>Cirium update expected shortly</span>
              </div>
            ) : (
              <TimeBlock
                align="right"
                label={stats.arrActualLabel || 'Actual'}
                time={stats.arrActual}
                zone={stats.arrActualZone}
              />
            )}
            {diverted && (
              <div className="flight-stats-diverted">
                Diverted to {stats.divertedTo}{stats.divertedToCity ? ` - ${stats.divertedToCity}` : ''}
              </div>
            )}
          </section>
        </div>

        <div className="flight-stats-status__delay" style={{ color: stats.arrDelayColor }}>
          <span>Flight Status</span>
          <strong>{stats.arrDelay || 'Unknown'}</strong>
        </div>
      </div>
    </article>
  );
}
