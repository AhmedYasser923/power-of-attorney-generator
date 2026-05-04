'use strict';

// ─── Ops Pagination State ─────────────────────────────────────────────────────
var opsPage = 1;
var opsTotalPages = (typeof OPS_TOTAL_PAGES !== 'undefined') ? OPS_TOTAL_PAGES : 1;
var adminYear  = (typeof CURRENT_YEAR  !== 'undefined') ? CURRENT_YEAR  : new Date().getFullYear();
var adminMonth = (typeof CURRENT_MONTH !== 'undefined') ? CURRENT_MONTH : (new Date().getMonth() + 1);
var adminDay   = 0;

// ─── Tab System ───────────────────────────────────────────────────────────────
// Track which charts have been lazily initialized (charts in hidden tabs must
// wait until the tab is visible, otherwise Chart.js measures 0 dimensions).
const chartInited = { insights: false };

document.querySelectorAll('.ad-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.ad-tab').forEach(t => t.classList.remove('ad-tab--active'));
    document.querySelectorAll('.ad-tab-panel').forEach(p => p.classList.remove('ad-tab-panel--active'));
    tab.classList.add('ad-tab--active');
    const panel = document.querySelector(`[data-panel="${tab.dataset.tab}"]`);
    if (panel) panel.classList.add('ad-tab-panel--active');

  });
});

// ─── Live Feed ────────────────────────────────────────────────────────────────
function prependFeedRow(op) {
  const tbody = document.getElementById('operations-feed-table');
  if (!tbody) return;

  const now = new Date(op.timestamp || Date.now());
  const time = now.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' });
  const cost = `$${ceilNum(op.costUSD)}`;

  const tr = document.createElement('tr');
  tr.className = 'ad-feed-row--new';
  tr.innerHTML = `
    <td style="white-space:nowrap; color:var(--text-muted);">${time}</td>
    <td>${escHtml(op.user)}</td>
    <td><span class="op-pill" data-type="${escHtml(op.operationType || '')}">${escHtml(op.type)}</span></td>
    <td>${cost}</td>
  `;
  tbody.insertBefore(tr, tbody.firstChild);

  // Keep feed capped at 100 rows
  while (tbody.children.length > 100) tbody.removeChild(tbody.lastChild);
}

// ─── Ops Pagination ───────────────────────────────────────────────────────────
function renderOpRows(logs) {
  var tbody = document.getElementById('operations-feed-table');
  if (!tbody) return;
  var loadingRow = document.getElementById('ops-loading-row');
  if (loadingRow) loadingRow.remove();
  if (!logs || logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1rem;">No operations this period.</td></tr>';
    return;
  }
  tbody.innerHTML = logs.map(function(op) {
    var time = new Date(op.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' });
    var cost = '$' + ceilNum(op.costUSD);
    return '<tr>' +
      '<td style="white-space:nowrap;color:var(--text-muted);">' + time + '</td>' +
      '<td>' + escHtml(op.userName || '—') + '</td>' +
      '<td><span class="op-pill" data-type="' + escHtml(op.operationType || '') + '">' + escHtml(op.label || op.operationType) + '</span></td>' +
      '<td>' + cost + '</td>' +
      '</tr>';
  }).join('');
}

function updateOpsPaginationControls() {
  var prev = document.getElementById('ops-prev-page');
  var next = document.getElementById('ops-next-page');
  var info = document.getElementById('ops-page-info');
  if (prev) prev.disabled = opsPage <= 1;
  if (next) next.disabled = opsPage >= opsTotalPages;
  if (info) info.textContent = 'Page ' + opsPage + ' of ' + opsTotalPages;
}

async function fetchOpsPage(page) {
  try {
    var url = '/admin/logs?year=' + adminYear + '&month=' + adminMonth + '&page=' + page + '&limit=5' + (adminDay > 0 ? '&day=' + adminDay : '');
    var res = await fetch(url);
    if (!res.ok) throw new Error('Request failed: ' + res.status);
    var json = await res.json();
    if (json.status !== 'success') throw new Error(json.message || 'Error');

    opsPage       = json.data.page;
    opsTotalPages = json.data.totalPages;

    renderOpRows(json.data.logs);
    updateOpsPaginationControls();
  } catch (err) {
    console.error('[AdminDashboard] Ops pagination error:', err.message);
  }
}

// ─── Notifications ───────────────────────────────────────────────────────────
function prependNotifItem(user) {
  const list = document.getElementById('pending-list');
  if (!list) return;

  // Remove empty state if present
  const empty = list.querySelector('.ad-empty');
  if (empty) empty.remove();

  const div = document.createElement('div');
  div.className = 'ad-notif-item';
  div.dataset.userId = user.id;
  const initial = (user.name || '?').charAt(0).toUpperCase();
  const dateStr = new Date(user.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  div.innerHTML = `
    <div class="ad-notif-avatar">${initial}</div>
    <div class="ad-notif-info">
      <p class="ad-notif-name">${escHtml(user.name)}</p>
      <p class="ad-notif-email">${escHtml(user.email)}</p>
    </div>
    <p class="ad-notif-time">${dateStr}</p>
    <div class="ad-notif-actions">
      <button class="ad-action-btn ad-action-btn--approve" data-action="approve" data-id="${user.id}">Approve</button>
      <button class="ad-action-btn ad-action-btn--suspend" data-action="reject" data-id="${user.id}">Reject</button>
    </div>
  `;
  list.insertBefore(div, list.firstChild);

  // Also add to users tab tbody
  prependUserRow({ _id: user.id, name: user.name, email: user.email, status: 'pending', createdAt: user.createdAt, operationCount: 0, totalCostUSD: 0 });
}

function prependUserRow(u) {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  const dateStr = new Date(u.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const tr = document.createElement('tr');
  tr.className = 'ad-user-row';
  tr.dataset.status = u.status;
  tr.innerHTML = `
    <td><strong>${escHtml(u.name)}</strong></td>
    <td style="color:var(--text-muted); font-size:0.875rem;">${escHtml(u.email)}</td>
    <td><span class="ad-badge ad-badge--${u.status}">${capitalize(u.status)}</span></td>
    <td style="color:var(--text-muted); font-size:0.8125rem;">${dateStr}</td>
    <td>0</td>
    <td>$0.00</td>
    <td><div class="ad-notif-actions">
      <button class="ad-action-btn ad-action-btn--approve" data-action="approve" data-id="${u._id}">Approve</button>
      <button class="ad-action-btn ad-action-btn--suspend" data-action="reject" data-id="${u._id}">Reject</button>
      <button class="ad-action-btn ad-action-btn--password" data-action="password" data-id="${u._id}" data-name="${escHtml(u.name)}">Password</button>
    </div></td>
  `;
  tbody.insertBefore(tr, tbody.firstChild);
}

function incrementNotifBadge() {
  const badge = document.getElementById('notif-badge');
  const stat = document.getElementById('pending-stat-count');
  if (badge) {
    badge.textContent = parseInt(badge.textContent || '0') + 1;
  } else {
    const tab = document.querySelector('[data-tab="notifications"]');
    if (tab) {
      const b = document.createElement('span');
      b.className = 'ad-tab__badge';
      b.id = 'notif-badge';
      b.textContent = '1';
      tab.appendChild(b);
    }
  }
  if (stat) stat.textContent = parseInt(stat.textContent || '0') + 1;
}

function decrementNotifBadge() {
  const badge = document.getElementById('notif-badge');
  const stat = document.getElementById('pending-stat-count');
  if (badge) {
    const n = parseInt(badge.textContent || '1') - 1;
    badge.textContent = n;
    if (n <= 0) badge.remove();
  }
  if (stat) {
    const n = parseInt(stat.textContent || '1') - 1;
    stat.textContent = Math.max(0, n);
  }
}

// ─── User Actions (approve / suspend / resume / reject / password) ────────────
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id, name } = btn.dataset;

  if (action === 'password') {
    openPasswordModal(id, name);
    return;
  }

  const endpoints = {
    approve: `/admin/users/${id}/approve`,
    reject:  `/admin/users/${id}/suspend`, // reject = suspend pending user
    suspend: `/admin/users/${id}/suspend`,
    resume:  `/admin/users/${id}/resume`
  };

  const url = endpoints[action];
  if (!url) return;

  try {
    btn.disabled = true;
    const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' } });
    const data = await res.json();
    if (data.status !== 'success') throw new Error(data.message || 'Error');

    if (action === 'approve' || action === 'reject') {
      // Remove from notifications list
      const notifItem = document.querySelector(`#pending-list [data-user-id="${id}"]`);
      if (notifItem) {
        notifItem.classList.add('ad-notif-item--removing');
        setTimeout(() => notifItem.remove(), 300);
      }
      decrementNotifBadge();
    }

    // Update users table row
    updateUserRow(id, action);
  } catch (err) {
    console.error('[Admin]', err.message);
    btn.disabled = false;
  }
});

function updateUserRow(id, action) {
  const rows = document.querySelectorAll(`#users-tbody .ad-user-row`);
  rows.forEach(row => {
    const btns = row.querySelectorAll('[data-id]');
    if (!btns.length || btns[0].dataset.id !== id) return;

    const badgeCell = row.querySelector('.ad-badge');
    const actionsCell = row.querySelector('.ad-notif-actions');

    let newStatus;
    if (action === 'approve') newStatus = 'active';
    else if (action === 'suspend' || action === 'reject') newStatus = 'suspended';
    else if (action === 'resume') newStatus = 'active';

    if (newStatus && badgeCell) {
      badgeCell.className = `ad-badge ad-badge--${newStatus}`;
      badgeCell.textContent = capitalize(newStatus);
      row.dataset.status = newStatus;
    }

    if (actionsCell) {
      actionsCell.innerHTML = buildActionButtons(id, newStatus || row.dataset.status);
    }
  });
}

function buildActionButtons(id, status) {
  let html = '';
  if (status === 'active') {
    html += `<button class="ad-action-btn ad-action-btn--suspend" data-action="suspend" data-id="${id}">Suspend</button>`;
  } else if (status === 'suspended') {
    html += `<button class="ad-action-btn ad-action-btn--resume" data-action="resume" data-id="${id}">Resume</button>`;
  } else if (status === 'pending') {
    html += `<button class="ad-action-btn ad-action-btn--approve" data-action="approve" data-id="${id}">Approve</button>`;
  }
  html += `<button class="ad-action-btn ad-action-btn--password" data-action="password" data-id="${id}">Password</button>`;
  return html;
}

// ─── Password Modal ───────────────────────────────────────────────────────────
let _pwdUserId = null;

function openPasswordModal(id, name) {
  _pwdUserId = id;
  const sub = document.getElementById('passwordModalSub');
  if (sub) sub.textContent = `Set a new password for ${name || 'this user'}`;
  const input = document.getElementById('newPasswordInput');
  if (input) input.value = '';
  const overlay = document.getElementById('passwordModal');
  if (overlay) overlay.classList.add('ad-modal-overlay--open');
  setTimeout(() => input && input.focus(), 100);
}

document.getElementById('modalCancel')?.addEventListener('click', closePasswordModal);
document.getElementById('passwordModal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closePasswordModal();
});

function closePasswordModal() {
  const overlay = document.getElementById('passwordModal');
  if (overlay) overlay.classList.remove('ad-modal-overlay--open');
  _pwdUserId = null;
}

document.getElementById('modalConfirm')?.addEventListener('click', async () => {
  const input = document.getElementById('newPasswordInput');
  const pwd = input?.value?.trim();
  if (!pwd || pwd.length < 8) {
    input.style.borderColor = '#ef4444';
    return;
  }
  input.style.borderColor = '';

  try {
    const res = await fetch(`/admin/users/${_pwdUserId}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    });
    const data = await res.json();
    if (data.status !== 'success') throw new Error(data.message || 'Error');
    closePasswordModal();
  } catch (err) {
    console.error('[Admin] Password change failed:', err.message);
  }
});

// ─── User filter buttons ──────────────────────────────────────────────────────
document.querySelectorAll('.ad-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ad-filter-btn').forEach(b => b.classList.remove('ad-filter-btn--active'));
    btn.classList.add('ad-filter-btn--active');
    const filter = btn.dataset.filter;
    document.querySelectorAll('.ad-user-row').forEach(row => {
      row.style.display = (filter === 'all' || row.dataset.status === filter) ? '' : 'none';
    });
  });
});

// ─── Ops Pagination Button Handlers ──────────────────────────────────────────
document.getElementById('ops-prev-page')?.addEventListener('click', function() {
  if (opsPage > 1) fetchOpsPage(opsPage - 1);
});

document.getElementById('ops-next-page')?.addEventListener('click', function() {
  if (opsPage < opsTotalPages) fetchOpsPage(opsPage + 1);
});

// ─── Overview Month Picker ────────────────────────────────────────────────────
document.getElementById('overviewDay')?.addEventListener('change', function() {
  adminDay = parseInt(this.value) || 0;
  opsPage = 1;
  fetchOpsPage(1);
});

document.getElementById('overviewMonth')?.addEventListener('change', async function() {
  const [y, m] = this.value.split('-').map(Number);
  adminYear = y;
  adminMonth = m;
  adminDay = 0;
  opsPage = 1;
  rebuildDayOptions(y, m, 0);

  try {
    const res = await fetch('/admin/logs?year=' + y + '&month=' + m + '&page=1&limit=5');
    const json = await res.json();
    if (json.status !== 'success') throw new Error(json.message || 'Error');

    opsPage = json.data.page;
    opsTotalPages = json.data.totalPages;

    renderOpRows(json.data.logs);
    updateOpsPaginationControls();

    // Update overview monthly summary with the selected month's data
    var monthOpsEl = document.getElementById('overview-month-ops');
    var monthCostEl = document.getElementById('overview-month-cost');
    if (monthOpsEl) monthOpsEl.textContent = json.data.total + ' ops';
    if (monthCostEl) monthCostEl.textContent = '$' + ceilNum(json.data.totalCostUSD || 0);
  } catch (err) {
    console.error('[AdminDashboard] Overview month change error:', err.message);
  }
});

// ─── Insights tab: month picker ───────────────────────────────────────────────
document.getElementById('insightsMonth')?.addEventListener('change', async function() {
  const [year, month] = this.value.split('-').map(Number);
  try {
    const res = await fetch('/admin/usage?year=' + year + '&month=' + month);
    const data = (await res.json()).data;

    // Update per-user table
    const userTbody = document.getElementById('insights-user-tbody');
    if (userTbody) {
      if (!data.userTotals || data.userTotals.length === 0) {
        userTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:1rem;">No data for this period.</td></tr>';
      } else {
        userTbody.innerHTML = data.userTotals.map(function(u) {
          return '<tr>' +
            '<td>' + escHtml(u._id.userName) + '</td>' +
            '<td>' + u.operationCount + '</td>' +
            '<td>$' + ceilNum(u.totalCostUSD) + '</td>' +
            '</tr>';
        }).join('');
      }
    }

    // Update operation breakdown table
    const opTbody = document.getElementById('insights-op-tbody');
    if (opTbody) {
      if (!data.opBreakdown || data.opBreakdown.length === 0) {
        opTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:1rem;">No data for this period.</td></tr>';
      } else {
        var totalCount = 0, totalCost = 0;
        var rows = data.opBreakdown.map(function(b) {
          totalCount += b.count;
          totalCost += b.totalCostUSD;
          return '<tr>' +
            '<td><span class="op-pill" data-type="' + escHtml(b._id || '') + '">' + escHtml(b.label || b._id) + '</span></td>' +
            '<td>' + b.count + '</td>' +
            '<td>$' + ceilNum(b.totalCostUSD) + '</td>' +
            '</tr>';
        }).join('');
        rows += '<tr class="ad-totals-row">' +
          '<td><strong>Total</strong></td>' +
          '<td><strong>' + totalCount + '</strong></td>' +
          '<td><strong>$' + ceilNum(totalCost) + '</strong></td>' +
          '</tr>';
        opTbody.innerHTML = rows;
      }
    }
  } catch (err) {
    console.error('[Admin] Usage fetch failed:', err.message);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ceilNum(v) {
  if (!v || v < 0) return '0.00';
  return (Math.ceil(v * 100) / 100).toFixed(2);
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function capitalize(str) {
  return String(str || '').charAt(0).toUpperCase() + String(str || '').slice(1);
}

// ─── Day Picker Helpers ───────────────────────────────────────────────────────
function egyptTodayInfo() {
  var now = new Date();
  var e = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  return { year: e.getUTCFullYear(), month: e.getUTCMonth() + 1, day: e.getUTCDate() };
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function rebuildDayOptions(year, month, selectedDay) {
  var sel = document.getElementById('overviewDay');
  if (!sel) return;
  var today = egyptTodayInfo();
  var maxDay = (year === today.year && month === today.month) ? today.day : daysInMonth(year, month);
  var html = '<option value="">All</option>';
  for (var d = 1; d <= maxDay; d++) {
    html += '<option value="' + d + '"' + (d === selectedDay ? ' selected' : '') + '>' + d + '</option>';
  }
  sel.innerHTML = html;
}

// ─── Init Pagination Controls on First Load ───────────────────────────────────
rebuildDayOptions(adminYear, adminMonth, 0);
updateOpsPaginationControls();
fetchOpsPage(1);

// ─── Reload All Clients ───────────────────────────────────────────────────────
(function () {
  var btn = document.getElementById('reload-clients-btn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    btn.disabled = true;
    btn.textContent = 'Sending…';
    fetch('/admin/reload-clients', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        btn.textContent = 'Reloaded ' + data.clientsNotified + ' client(s)';
        setTimeout(function () {
          btn.disabled = false;
          btn.textContent = 'Reload All Clients';
        }, 3000);
      })
      .catch(function () {
        btn.textContent = 'Error — try again';
        btn.disabled = false;
      });
  });
})();

