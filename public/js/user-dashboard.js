'use strict';

// ─── Pagination state ─────────────────────────────────────────────────────────
var currentPage  = 1;
var totalPages   = (typeof UD_TOTAL_PAGES   !== 'undefined') ? UD_TOTAL_PAGES   : 1;
var currentYear  = (typeof UD_CURRENT_YEAR  !== 'undefined') ? UD_CURRENT_YEAR  : new Date().getFullYear();
var currentMonth = (typeof UD_CURRENT_MONTH !== 'undefined') ? UD_CURRENT_MONTH : (new Date().getMonth() + 1);
var currentDay   = (typeof UD_CURRENT_DAY   !== 'undefined') ? UD_CURRENT_DAY   : 0;

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
  var sel = document.getElementById('daySelect');
  if (!sel) return;
  var today = egyptTodayInfo();
  var maxDay = (year === today.year && month === today.month) ? today.day : daysInMonth(year, month);
  var html = '<option value="">All</option>';
  for (var d = 1; d <= maxDay; d++) {
    html += '<option value="' + d + '"' + (d === selectedDay ? ' selected' : '') + '>' + d + '</option>';
  }
  sel.innerHTML = html;
}

// ─── Month picker — triggers full page reload (resets day filter) ─────────────
(function () {
  var sel = document.getElementById('monthSelect');
  if (sel) {
    sel.addEventListener('change', function () {
      var parts = this.value.split('-');
      window.location.href = '/me?year=' + parts[0] + '&month=' + parts[1];
    });
  }
})();

// ─── Day picker — triggers full page reload ───────────────────────────────────
(function () {
  var sel = document.getElementById('daySelect');
  if (sel) {
    sel.addEventListener('change', function () {
      var day = parseInt(this.value) || 0;
      var url = '/me?year=' + currentYear + '&month=' + currentMonth;
      if (day > 0) url += '&day=' + day;
      window.location.href = url;
    });
  }
})();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ceilNum(v) {
  if (!v || v < 0) return '0.00';
  return (Math.ceil(v * 100) / 100).toFixed(2);
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Africa/Cairo'
  });
}

function getMetaDetail(log) {
  var parts = [];
  if (log.metadata && log.metadata.pnr) parts.push('PNR: ' + escHtml(log.metadata.pnr));
  if (log.metadata && log.metadata.passengerCount) parts.push(log.metadata.passengerCount + ' pax');
  if (log.metadata && log.metadata.language) parts.push(escHtml(log.metadata.language));
  if (log.metadata && log.metadata.fileCount) parts.push(log.metadata.fileCount + ' file(s)');
  return parts.length > 0 ? parts.join(' \u00b7 ') : '\u2014';
}

// ─── Render log rows into tbody ───────────────────────────────────────────────
function renderLogRows(logs) {
  var tbody = document.querySelector('.ud-table tbody');
  if (!tbody) return;

  if (!logs || logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1rem;">No operations recorded this period.</td></tr>';
    return;
  }

  tbody.innerHTML = logs.map(function(log) {
    return '<tr>' +
      '<td>' + fmtDate(log.createdAt) + '</td>' +
      '<td><span class="op-pill" data-type="' + escHtml(log.operationType || '') + '">' + escHtml(log.label || log.operationType) + '</span></td>' +
      '<td style="color:var(--text-muted);font-size:0.8125rem;">' + escHtml(log.model || '—') + '</td>' +
      '<td>$' + ceilNum(log.costUSD) + '</td>' +
      '<td style="font-size:0.8125rem;color:var(--text-muted);">' + getMetaDetail(log) + '</td>' +
      '</tr>';
  }).join('');
}

// ─── Update pagination controls ───────────────────────────────────────────────
function updatePaginationControls() {
  var prev  = document.getElementById('ud-prev-page');
  var next  = document.getElementById('ud-next-page');
  var info  = document.getElementById('ud-page-info');
  if (prev) prev.disabled = currentPage <= 1;
  if (next) next.disabled = currentPage >= totalPages;
  if (info) info.textContent = 'Page ' + currentPage + ' of ' + totalPages;
}

// ─── Fetch a page of logs via AJAX ────────────────────────────────────────────
async function fetchLogsPage(page) {
  try {
    var url = '/api/me/logs?year=' + currentYear + '&month=' + currentMonth + '&page=' + page + '&limit=5' + (currentDay > 0 ? '&day=' + currentDay : '');
    var res = await fetch(url);
    if (!res.ok) throw new Error('Request failed: ' + res.status);
    var json = await res.json();
    if (json.status !== 'success') throw new Error(json.message || 'Error');

    currentPage = json.data.page;
    totalPages  = json.data.totalPages;

    renderLogRows(json.data.logs);
    updatePaginationControls();
  } catch (err) {
    console.error('[UserDashboard] Pagination error:', err.message);
  }
}

// ─── Button handlers ──────────────────────────────────────────────────────────
document.getElementById('ud-prev-page')?.addEventListener('click', function() {
  if (currentPage > 1) fetchLogsPage(currentPage - 1);
});

document.getElementById('ud-next-page')?.addEventListener('click', function() {
  if (currentPage < totalPages) fetchLogsPage(currentPage + 1);
});

// ─── Init pagination controls and day picker on first load ───────────────────
rebuildDayOptions(currentYear, currentMonth, currentDay);
updatePaginationControls();
