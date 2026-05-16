import { useEffect, useMemo, useState } from 'react';
import { getUsageBreakdown, getUsageLogs } from '../../api/usage.js';
import './MyUsagePage.css';

const EGYPT_OFFSET_MS = 2 * 60 * 60 * 1000;
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

const OP_LABELS = {
  ticket_analysis: 'Ticket Analysis',
  email_builder: 'Email Builder',
  email_translation: 'Email Translation',
  email_translation_sync: 'Email Translation Sync',
  email_refinement: 'Email Refinement',
  poa_standard: 'POA (Standard)',
  poa_lufthansa: 'POA (Lufthansa)',
  poa_aerlingus: 'POA (Aer Lingus)',
  text_autofill: 'Text Autofill',
  barcode_decode: 'Barcode Decode',
  sig_processing: 'Signature Processing'
};

function getEgyptDateParts(date = new Date()) {
  const egyptDate = new Date(date.getTime() + EGYPT_OFFSET_MS);

  return {
    year: egyptDate.getUTCFullYear(),
    month: egyptDate.getUTCMonth() + 1,
    day: egyptDate.getUTCDate()
  };
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function ceilCurrency(value) {
  const numeric = Number(value) || 0;

  if (numeric <= 0) return '0.00';

  return (Math.ceil(numeric * 100) / 100).toFixed(2);
}

function formatDateTime(value) {
  if (!value) return '-';

  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Cairo'
  });
}

function formatOperationLabel(log) {
  return log.label || OP_LABELS[log.operationType] || log.operationType || '-';
}

function formatMetadata(log) {
  const metadata = log.metadata || {};

  if (metadata.grouped || log.operationType === 'email_builder') {
    const groupedCount = Number(log.operationCount || metadata.operationCount || 1);
    return `${groupedCount} operation${groupedCount === 1 ? '' : 's'}`;
  }

  if (metadata.pnr) {
    return `PNR: ${metadata.pnr}${metadata.passengerCount ? ` (${metadata.passengerCount} pax)` : ''}`;
  }

  if (metadata.language) return metadata.language;
  if (metadata.fileCount) return `${metadata.fileCount} file(s)`;

  return '-';
}

function buildMonthOptions(selectedYear, selectedMonth) {
  const today = getEgyptDateParts();
  const options = [];
  const seen = new Set();

  for (let index = 0; index < 24; index += 1) {
    const date = new Date(Date.UTC(today.year, today.month - 1 - index, 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const key = `${year}-${month}`;

    seen.add(key);
    options.push({
      year,
      month,
      label: `${MONTH_NAMES[month - 1]} ${year}`
    });
  }

  const selectedKey = `${selectedYear}-${selectedMonth}`;
  if (!seen.has(selectedKey)) {
    options.unshift({
      year: selectedYear,
      month: selectedMonth,
      label: `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`
    });
  }

  return options;
}

function getInitialPeriod() {
  const params = new URLSearchParams(window.location.search);
  const fallback = getEgyptDateParts();
  const parsedYear = Number.parseInt(params.get('year'), 10);
  const parsedMonth = Number.parseInt(params.get('month'), 10);
  const parsedDay = Number.parseInt(params.get('day'), 10);
  const year = parsedYear > 0 ? parsedYear : fallback.year;
  const month = parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : fallback.month;
  const day = parsedDay >= 1 && parsedDay <= 31 ? parsedDay : 0;

  return { year, month, day };
}

async function loadDailyStats() {
  const today = getEgyptDateParts();
  const firstPage = await getUsageLogs({
    year: today.year,
    month: today.month,
    day: today.day,
    page: 1,
    limit: 1
  });
  const data = firstPage.data || {};

  return {
    count: data.totalOperations ?? data.total ?? 0,
    cost: data.totalCostUSD || 0
  };
}

export default function MyUsagePage() {
  const initialPeriod = useMemo(() => getInitialPeriod(), []);
  const [period, setPeriod] = useState({
    year: initialPeriod.year,
    month: initialPeriod.month
  });
  const [selectedDay, setSelectedDay] = useState(initialPeriod.day);
  const [page, setPage] = useState(1);
  const [breakdown, setBreakdown] = useState([]);
  const [logs, setLogs] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [dailyStats, setDailyStats] = useState({ count: 0, cost: 0 });
  const [usageLoading, setUsageLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const monthOptions = useMemo(
    () => buildMonthOptions(period.year, period.month),
    [period.month, period.year]
  );

  const dayOptions = useMemo(() => {
    const today = getEgyptDateParts();
    const maxDay = period.year === today.year && period.month === today.month
      ? today.day
      : daysInMonth(period.year, period.month);

    return Array.from({ length: maxDay }, (_, index) => index + 1);
  }, [period.month, period.year]);

  const totalOps = useMemo(
    () => breakdown.reduce((sum, item) => sum + (Number(item.count) || 0), 0),
    [breakdown]
  );

  const totalCostUSD = useMemo(
    () => breakdown.reduce((sum, item) => sum + (Number(item.totalCostUSD) || 0), 0),
    [breakdown]
  );

  useEffect(() => {
    let active = true;

    setUsageLoading(true);
    setError('');

    getUsageBreakdown({ year: period.year, month: period.month })
      .then((payload) => {
        if (active) setBreakdown(payload.data || []);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setUsageLoading(false);
      });

    return () => {
      active = false;
    };
  }, [period.month, period.year, reloadKey]);

  useEffect(() => {
    let active = true;

    setLogsLoading(true);
    setError('');

    getUsageLogs({
      year: period.year,
      month: period.month,
      day: selectedDay,
      page,
      limit: 5
    })
      .then((payload) => {
        if (!active) return;

        const data = payload.data || {};
        setLogs(data.logs || []);
        setTotalPages(data.totalPages || 1);
        setTotalLogs(data.total || 0);
      })
      .catch((err) => {
        if (!active) return;

        setLogs([]);
        setTotalPages(1);
        setTotalLogs(0);
        setError(err.message);
      })
      .finally(() => {
        if (active) setLogsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, period.month, period.year, reloadKey, selectedDay]);

  useEffect(() => {
    let active = true;

    loadDailyStats()
      .then((stats) => {
        if (active) setDailyStats(stats);
      })
      .catch(() => {
        if (active) setDailyStats({ count: 0, cost: 0 });
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  const changeMonth = (event) => {
    const [year, month] = event.target.value.split('-').map(Number);

    setPeriod({ year, month });
    setSelectedDay(0);
    setPage(1);
  };

  const changeDay = (event) => {
    setSelectedDay(Number.parseInt(event.target.value, 10) || 0);
    setPage(1);
  };

  const retry = () => {
    setPage(1);
    setReloadKey((current) => current + 1);
  };

  const showInitialLoading = usageLoading && logsLoading && logs.length === 0;

  if (showInitialLoading) {
    return (
      <section className="my-usage">
        <header className="my-usage__header">
          <div className="skel skel--title" />
          <div className="skel skel--subtitle" />
        </header>
        <div className="my-usage__filters">
          <div className="skel skel--select" />
          <div className="skel skel--select skel--select-sm" />
          <div className="my-usage__month-summary">
            <div className="skel skel--chip" />
            <span className="my-usage__month-stat-sep">/</span>
            <div className="skel skel--chip" />
          </div>
        </div>
        <div className="my-usage__stat-grid">
          <article className="my-usage__stat-card">
            <div className="skel skel--label" />
            <div className="skel skel--big-number" />
          </article>
          <article className="my-usage__stat-card">
            <div className="skel skel--label" />
            <div className="skel skel--big-number" />
          </article>
        </div>
        <section className="my-usage__section">
          <div className="skel skel--section-title" />
          <div className="my-usage__table-wrap">
            <table className="my-usage__table">
              <thead>
                <tr>
                  <th><div className="skel skel--th" /></th>
                  <th><div className="skel skel--th" /></th>
                  <th><div className="skel skel--th" /></th>
                  <th><div className="skel skel--th" /></th>
                  <th><div className="skel skel--th" /></th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map((row) => (
                  <tr key={row}>
                    <td><div className="skel skel--td" style={{ width: '80%' }} /></td>
                    <td><div className="skel skel--pill" /></td>
                    <td><div className="skel skel--td" style={{ width: '60%' }} /></td>
                    <td><div className="skel skel--td" style={{ width: '50%' }} /></td>
                    <td><div className="skel skel--td" style={{ width: '70%' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="my-usage" aria-labelledby="my-usage-title">
      <header className="my-usage__header">
        <h1 id="my-usage-title">My Usage</h1>
        <p>Track your operations and API costs</p>
      </header>

      <div className="my-usage__filters">
        <label htmlFor="my-usage-month">Period</label>
        <select
          id="my-usage-month"
          onChange={changeMonth}
          value={`${period.year}-${period.month}`}
        >
          {monthOptions.map((option) => (
            <option key={`${option.year}-${option.month}`} value={`${option.year}-${option.month}`}>
              {option.label}
            </option>
          ))}
        </select>

        <label htmlFor="my-usage-day">Day</label>
        <select id="my-usage-day" onChange={changeDay} value={selectedDay || ''}>
          <option value="">All</option>
          {dayOptions.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>

        <div className="my-usage__month-summary" aria-live="polite">
          <span className="my-usage__month-stat">
            {usageLoading ? '...' : `${totalOps} ops`}
          </span>
          <span className="my-usage__month-stat-sep">/</span>
          <span className="my-usage__month-stat">
            ${usageLoading ? '...' : ceilCurrency(totalCostUSD)}
          </span>
        </div>
      </div>

      {error && (
        <div className="my-usage__alert" role="alert">
          <span>{error}</span>
          <button type="button" onClick={retry}>Retry</button>
        </div>
      )}

      <div className="my-usage__stat-grid">
        <article className="my-usage__stat-card">
          <p className="my-usage__stat-label">Ops Today</p>
          <p className="my-usage__stat-value">{dailyStats.count}</p>
        </article>
        <article className="my-usage__stat-card">
          <p className="my-usage__stat-label">Cost Today (USD)</p>
          <p className="my-usage__stat-value my-usage__stat-value--accent">
            ${ceilCurrency(dailyStats.cost)}
          </p>
        </article>
      </div>

      <section className="my-usage__section" aria-labelledby="my-usage-log-title">
        <h2 id="my-usage-log-title">Operation Log</h2>

        <div className="my-usage__table-wrap">
          <table className="my-usage__table">
            <thead>
              <tr>
                <th>Date &amp; Time</th>
                <th>Operation</th>
                <th>Model</th>
                <th>Cost (USD)</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td className="my-usage__empty-cell" colSpan="5">
                    {showInitialLoading ? 'Loading operations...' : 'No operations recorded this period.'}
                  </td>
                </tr>
              ) : logs.map((log) => (
                <tr key={log._id || `${log.createdAt}-${log.operationType}`}>
                  <td>{formatDateTime(log.createdAt)}</td>
                  <td>
                    <span className="my-usage__op-pill" data-type={log.operationType || ''}>
                      {formatOperationLabel(log)}
                    </span>
                  </td>
                  <td className="my-usage__muted-cell">{log.model || '-'}</td>
                  <td className="my-usage__cost-cell">${ceilCurrency(log.costUSD)}</td>
                  <td className="my-usage__muted-cell">{formatMetadata(log)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(logs.length > 0 || totalLogs > 0) && (
          <div className="my-usage__pagination">
            <button
              type="button"
              disabled={page <= 1 || logsLoading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Prev
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              type="button"
              disabled={page >= totalPages || logsLoading}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Next
            </button>
          </div>
        )}
      </section>
    </section>
  );
}
