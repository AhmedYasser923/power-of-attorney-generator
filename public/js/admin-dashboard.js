'use strict';

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
  const time = now.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const cost = op.costUSD > 0 ? `$${ceilNum(op.costUSD)}` : '—';

  const tr = document.createElement('tr');
  tr.className = 'ad-feed-row--new';
  tr.innerHTML = `
    <td style="white-space:nowrap; color:var(--text-muted);">${time}</td>
    <td>${escHtml(op.user)}</td>
    <td><span class="op-pill">${escHtml(op.type)}</span></td>
    <td>${cost}</td>
  `;
  tbody.insertBefore(tr, tbody.firstChild);

  // Keep feed capped at 100 rows
  while (tbody.children.length > 100) tbody.removeChild(tbody.lastChild);
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

// ─── Insights tab: month picker (table data only)
document.getElementById('insightsMonth')?.addEventListener('change', async function() {
  const [year, month] = this.value.split('-').map(Number);
  try {
    const res = await fetch(`/admin/usage?year=${year}&month=${month}`);
    const data = (await res.json()).data;

    // Update per-user table
    const tbody = document.getElementById('insights-user-tbody');
    if (tbody) {
      tbody.innerHTML = data.userTotals.map(u => `
        <tr>
          <td>${escHtml(u._id.userName)}</td>
          <td>${u.operationCount}</td>
          <td>$${(+(u.totalCostUSD)||0).toFixed(2)}</td>
          <td>£${(+(u.totalCostEGP)||0).toFixed(2)}</td>
        </tr>
      `).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1rem;">No data</td></tr>';
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
