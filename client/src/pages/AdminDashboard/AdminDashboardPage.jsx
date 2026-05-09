import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  changeUserPassword,
  getAdminLogs,
  getAdminUsage,
  getAdminUsers,
  reloadClients,
  updateUserStatus
} from '../../api/admin.js';
import {
  buildMonthOptions,
  capitalize,
  ceilCurrency,
  daysInMonth,
  formatDate,
  formatDateTime,
  formatOperationLabel,
  getEgyptDateParts,
  getUserId
} from './adminDashboardUtils.js';
import './AdminDashboardPage.css';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'insights', label: 'Cost Insights' },
  { id: 'users', label: 'Users' }
];

function StatCard({ label, tone = '', value }) {
  return (
    <article className="admin-stat-card">
      <p>{label}</p>
      <strong className={tone ? `admin-stat-card__value--${tone}` : ''}>{value}</strong>
    </article>
  );
}

function PasswordModal({ busy, error, onClose, onSubmit, user }) {
  const [password, setPassword] = useState('');

  if (!user) return null;

  return (
    <div className="admin-modal-overlay" onMouseDown={onClose}>
      <form
        className="admin-modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(password);
        }}
      >
        <h2>Change Password</h2>
        <p>Set a new password for {user.name || 'this user'}</p>
        <input
          autoFocus
          minLength="8"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="New password (min. 8 chars)"
          type="password"
          value={password}
        />
        {error && <div className="admin-modal__error">{error}</div>}
        <div>
          <button disabled={busy} onClick={onClose} type="button">Cancel</button>
          <button disabled={busy || password.length < 8} type="submit">
            {busy ? 'Saving...' : 'Save Password'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const today = useMemo(() => getEgyptDateParts(), []);
  const [activeTab, setActiveTab] = useState('overview');
  const [period, setPeriod] = useState({ year: today.year, month: today.month });
  const [selectedDay, setSelectedDay] = useState(0);
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState([]);
  const [usage, setUsage] = useState({ userTotals: [], opBreakdown: [], monthlyTotals: [] });
  const [logs, setLogs] = useState([]);
  const [dailyStats, setDailyStats] = useState({ count: 0, cost: 0 });
  const [totalLogs, setTotalLogs] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [userFilter, setUserFilter] = useState('all');
  const [passwordUser, setPasswordUser] = useState(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [actionBusy, setActionBusy] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const monthOptions = useMemo(
    () => buildMonthOptions(period.year, period.month, usage.monthlyTotals),
    [period.month, period.year, usage.monthlyTotals]
  );

  const dayOptions = useMemo(() => {
    const maxDay = period.year === today.year && period.month === today.month
      ? today.day
      : daysInMonth(period.year, period.month);

    return Array.from({ length: maxDay }, (_, index) => index + 1);
  }, [period.month, period.year, today.day, today.month, today.year]);

  const userTotalsMap = useMemo(() => {
    const map = new Map();
    usage.userTotals.forEach((entry) => {
      map.set(getUserId(entry), {
        operationCount: Number(entry.operationCount) || 0,
        totalCostUSD: Number(entry.totalCostUSD) || 0
      });
    });
    return map;
  }, [usage.userTotals]);

  const usersWithStats = useMemo(() => users.map((item) => ({
    ...item,
    operationCount: userTotalsMap.get(String(item._id))?.operationCount || 0,
    totalCostUSD: userTotalsMap.get(String(item._id))?.totalCostUSD || 0
  })), [userTotalsMap, users]);

  const pendingUsers = useMemo(
    () => usersWithStats.filter((item) => item.status === 'pending'),
    [usersWithStats]
  );

  const filteredUsers = useMemo(
    () => usersWithStats.filter((item) => userFilter === 'all' || item.status === userFilter),
    [userFilter, usersWithStats]
  );

  const totalOps = useMemo(
    () => usage.opBreakdown.reduce((sum, item) => sum + (Number(item.count) || 0), 0),
    [usage.opBreakdown]
  );

  const totalCostUSD = useMemo(
    () => usage.opBreakdown.reduce((sum, item) => sum + (Number(item.totalCostUSD) || 0), 0),
    [usage.opBreakdown]
  );

  const initialLoading = loadingUsers && loadingUsage && loadingLogs;

  useEffect(() => {
    let active = true;
    setLoadingUsers(true);
    setError('');

    getAdminUsers()
      .then((payload) => {
        if (active) setUsers(payload.data || []);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoadingUsers(false);
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    let active = true;
    setLoadingUsage(true);
    setError('');

    getAdminUsage({ year: period.year, month: period.month })
      .then((payload) => {
        if (active) setUsage(payload.data || { userTotals: [], opBreakdown: [], monthlyTotals: [] });
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoadingUsage(false);
      });

    return () => {
      active = false;
    };
  }, [period.month, period.year, reloadKey]);

  useEffect(() => {
    let active = true;
    setLoadingLogs(true);
    setError('');

    getAdminLogs({
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
        setTotalLogs(data.total || 0);
        setTotalPages(data.totalPages || 1);
      })
      .catch((err) => {
        if (!active) return;
        setLogs([]);
        setTotalLogs(0);
        setTotalPages(1);
        setError(err.message);
      })
      .finally(() => {
        if (active) setLoadingLogs(false);
      });

    return () => {
      active = false;
    };
  }, [page, period.month, period.year, reloadKey, selectedDay]);

  useEffect(() => {
    let active = true;

    getAdminLogs({
      year: today.year,
      month: today.month,
      day: today.day,
      page: 1,
      limit: 1
    })
      .then((payload) => {
        if (!active) return;
        const data = payload.data || {};
        setDailyStats({
          count: data.total || 0,
          cost: data.totalCostUSD || 0
        });
      })
      .catch(() => {
        if (active) setDailyStats({ count: 0, cost: 0 });
      });

    return () => {
      active = false;
    };
  }, [reloadKey, today.day, today.month, today.year]);

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

  const refresh = () => {
    setMessage('');
    setError('');
    setReloadKey((current) => current + 1);
  };

  const setLocalUserStatus = (id, status) => {
    setUsers((current) => current.map((item) => (
      String(item._id) === String(id) ? { ...item, status } : item
    )));
  };

  const runUserAction = async (id, action) => {
    setActionBusy(`${id}-${action}`);
    setError('');
    setMessage('');

    try {
      await updateUserStatus({ id, action });
      const nextStatus = action === 'approve' || action === 'resume' ? 'active' : 'suspended';
      setLocalUserStatus(id, nextStatus);
      setMessage(`User ${nextStatus}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy('');
    }
  };

  const savePassword = async (password) => {
    if (!passwordUser) return;

    setPasswordBusy(true);
    setPasswordError('');

    try {
      await changeUserPassword({ id: passwordUser._id, password });
      setPasswordUser(null);
      setMessage('Password updated.');
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setPasswordBusy(false);
    }
  };

  const reloadAllClients = async () => {
    setActionBusy('reload');
    setError('');
    setMessage('');

    try {
      const payload = await reloadClients();
      setMessage(`Reloaded ${payload.clientsNotified || 0} client(s).`);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy('');
    }
  };

  const renderUserActions = (item) => {
    if (item.role === 'admin') return <span className="admin-users__muted">Admin account</span>;

    return (
      <div className="admin-action-row">
        {item.status === 'pending' && (
          <button
            disabled={!!actionBusy}
            onClick={() => runUserAction(item._id, 'approve')}
            type="button"
          >
            Approve
          </button>
        )}
        {item.status === 'pending' && (
          <button
            className="is-danger"
            disabled={!!actionBusy}
            onClick={() => runUserAction(item._id, 'reject')}
            type="button"
          >
            Reject
          </button>
        )}
        {item.status === 'active' && (
          <button
            className="is-danger"
            disabled={!!actionBusy}
            onClick={() => runUserAction(item._id, 'suspend')}
            type="button"
          >
            Suspend
          </button>
        )}
        {item.status === 'suspended' && (
          <button
            disabled={!!actionBusy}
            onClick={() => runUserAction(item._id, 'resume')}
            type="button"
          >
            Resume
          </button>
        )}
        <button disabled={!!actionBusy} onClick={() => setPasswordUser(item)} type="button">Password</button>
      </div>
    );
  };

  if (user?.role !== 'admin') {
    return (
      <section className="admin-dashboard admin-dashboard--blocked">
        <h1>Admin Panel</h1>
        <p>Admin access is required.</p>
      </section>
    );
  }

  if (initialLoading) {
    return (
      <section className="admin-dashboard admin-dashboard--loading">
        <div className="dashboard-loader">
          <div className="dashboard-loader__spinner" />
          <p>Loading dashboard...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-dashboard" aria-labelledby="admin-dashboard-title">
      <header className="admin-dashboard__header">
        <div>
          <h1 id="admin-dashboard-title">Admin Panel</h1>
          <p>Real-time insights, user management, and cost tracking</p>
        </div>
        <button disabled={actionBusy === 'reload'} onClick={reloadAllClients} type="button">
          {actionBusy === 'reload' ? 'Sending...' : 'Reload All Clients'}
        </button>
      </header>

      {(error || message) && (
        <div className={`admin-dashboard__notice${error ? ' is-error' : ''}`}>
          <span>{error || message}</span>
          {error && <button onClick={refresh} type="button">Retry</button>}
        </div>
      )}

      <div className="admin-stat-grid">
        <StatCard label="Ops Today" value={dailyStats.count} />
        <StatCard label="Cost Today (USD)" tone="blue" value={`$${ceilCurrency(dailyStats.cost)}`} />
        <StatCard label="Pending Signups" tone="amber" value={pendingUsers.length} />
      </div>

      <nav className="admin-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'is-active' : ''}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
            {tab.id === 'notifications' && pendingUsers.length > 0 && (
              <span>{pendingUsers.length}</span>
            )}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' && (
        <section className="admin-panel">
          <div className="admin-panel__head">
            <h2>Live Operations Feed</h2>
            <div className="admin-filters">
              <label>
                <span>Period</span>
                <select onChange={changeMonth} value={`${period.year}-${period.month}`}>
                  {monthOptions.map((option) => (
                    <option key={`${option.year}-${option.month}`} value={`${option.year}-${option.month}`}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Day</span>
                <select onChange={changeDay} value={selectedDay || ''}>
                  <option value="">All</option>
                  {dayOptions.map((day) => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </label>
              <div className="admin-summary">
                <strong>{loadingUsage ? '...' : `${totalOps} ops`}</strong>
                <span>/</span>
                <strong>${loadingUsage ? '...' : ceilCurrency(totalCostUSD)}</strong>
              </div>
            </div>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date &amp; Time</th>
                  <th>User</th>
                  <th>Operation</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td className="admin-table__empty" colSpan="4">
                      {loadingLogs ? 'Loading operations...' : 'No operations this period.'}
                    </td>
                  </tr>
                ) : logs.map((log) => (
                  <tr key={log._id || `${log.createdAt}-${log.operationType}`}>
                    <td>{formatDateTime(log.createdAt)}</td>
                    <td>{log.userName || '-'}</td>
                    <td>
                      <span className="admin-op-pill" data-type={log.operationType || ''}>
                        {formatOperationLabel(log)}
                      </span>
                    </td>
                    <td className="admin-table__cost">${ceilCurrency(log.costUSD)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(logs.length > 0 || totalLogs > 0) && (
            <div className="admin-pagination">
              <button disabled={page <= 1 || loadingLogs} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">
                Prev
              </button>
              <span>Page {page} of {totalPages}</span>
              <button disabled={page >= totalPages || loadingLogs} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} type="button">
                Next
              </button>
            </div>
          )}
        </section>
      )}

      {activeTab === 'notifications' && (
        <section className="admin-panel">
          <h2>Pending Signup Requests</h2>
          {pendingUsers.length === 0 ? (
            <div className="admin-empty">No pending signup requests.</div>
          ) : (
            <div className="admin-notification-list">
              {pendingUsers.map((item) => (
                <article className="admin-notification" key={item._id}>
                  <div className="admin-avatar">{item.name?.charAt(0).toUpperCase() || '?'}</div>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.email}</span>
                  </div>
                  <time>{formatDate(item.createdAt)}</time>
                  {renderUserActions(item)}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'insights' && (
        <section className="admin-insights-grid">
          <div className="admin-panel">
            <h2>Operation Breakdown</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Operation</th>
                    <th>Count</th>
                    <th>Total Cost (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.opBreakdown.length === 0 ? (
                    <tr><td className="admin-table__empty" colSpan="3">No data for this period.</td></tr>
                  ) : usage.opBreakdown.map((item) => (
                    <tr key={item._id || item.label}>
                      <td>
                        <span className="admin-op-pill" data-type={item._id || ''}>{item.label || item._id}</span>
                      </td>
                      <td>{item.count}</td>
                      <td className="admin-table__cost">${ceilCurrency(item.totalCostUSD)}</td>
                    </tr>
                  ))}
                  {usage.opBreakdown.length > 0 && (
                    <tr className="admin-table__total">
                      <td>Total</td>
                      <td>{totalOps}</td>
                      <td>${ceilCurrency(totalCostUSD)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="admin-panel">
            <h2>Per-User Breakdown</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Operations</th>
                    <th>Cost (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.userTotals.length === 0 ? (
                    <tr><td className="admin-table__empty" colSpan="3">No data for this period.</td></tr>
                  ) : usage.userTotals.map((item) => (
                    <tr key={getUserId(item)}>
                      <td>{item._id?.userName || '-'}</td>
                      <td>{item.operationCount || 0}</td>
                      <td className="admin-table__cost">${ceilCurrency(item.totalCostUSD)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'users' && (
        <section className="admin-panel">
          <div className="admin-panel__head">
            <h2>All Users</h2>
            <div className="admin-filter-buttons">
              {['all', 'active', 'pending', 'suspended'].map((filter) => (
                <button
                  className={userFilter === filter ? 'is-active' : ''}
                  key={filter}
                  onClick={() => setUserFilter(filter)}
                  type="button"
                >
                  {capitalize(filter)}
                </button>
              ))}
            </div>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table admin-users-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Ops</th>
                  <th>Cost (USD)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td className="admin-table__empty" colSpan="7">
                      {loadingUsers ? 'Loading users...' : 'No users found.'}
                    </td>
                  </tr>
                ) : filteredUsers.map((item) => (
                  <tr key={item._id}>
                    <td>
                      <strong>{item.name}</strong>
                      {item.role === 'admin' && <span className="admin-badge admin-badge--admin">admin</span>}
                    </td>
                    <td className="admin-table__muted">{item.email}</td>
                    <td>
                      <span className={`admin-badge admin-badge--${item.status}`}>
                        {capitalize(item.status)}
                      </span>
                    </td>
                    <td className="admin-table__muted">{formatDate(item.createdAt)}</td>
                    <td>{item.operationCount || 0}</td>
                    <td className="admin-table__cost">${ceilCurrency(item.totalCostUSD)}</td>
                    <td>{renderUserActions(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <PasswordModal
        busy={passwordBusy}
        error={passwordError}
        onClose={() => {
          setPasswordUser(null);
          setPasswordError('');
        }}
        onSubmit={savePassword}
        user={passwordUser}
      />
    </section>
  );
}
