/* =============================================================================
   ticket-analyzer.js - UPDATED WITH PER-LEG PASSENGER TICKET TRACKING
   ============================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  const ticketDropZone = document.getElementById('ticketDropZone');
  const ticketInput = document.getElementById('ticketInput');
  const previewTicket = document.getElementById('previewTicketContainer');
  const ticketName = document.getElementById('ticketNameDisplay');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const clearBtn = document.getElementById('clearFilesBtn');
  const resultsCard = document.getElementById('resultsCard');

  // ---------------------------------------------------------------------------
  // STYLES
  // ---------------------------------------------------------------------------
  const styleEl = document.createElement('style');
  styleEl.innerHTML = `
    /* PHASE 1: FONT SMOOTHING & TYPOGRAPHY UPGRADE */
    * {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
    }

    body, input, button, select, textarea {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI',
                   'SF Pro Display', Roboto, 'Helvetica Neue',
                   Arial, sans-serif;
      font-feature-settings: 'kern' 1, 'liga' 1;
      letter-spacing: -0.01em;
    }

    .fc-airline, .fc-iata, .route-header {
      font-weight: 600;
      letter-spacing: -0.02em;
    }

    .fc-airport, .fc-city {
      font-weight: 400;
      letter-spacing: -0.005em;
    }

    @keyframes pulsyGlassyRed {
      0%   { box-shadow: 0 0 0 0 rgba(220,38,38,0.5), inset 0 0 10px rgba(220,38,38,0.1);
              background-color: rgba(254,242,242,0.4); border-color: rgba(239,68,68,0.5); }
      100% { box-shadow: 0 0 20px 8px rgba(220,38,38,0), inset 0 0 30px rgba(220,38,38,0.2);
              background-color: rgba(254,242,242,0.85); border-color: rgba(220,38,38,1); }
    }
    .flight-card.eoc-alert-active {
      animation: pulsyGlassyRed 1.5s infinite alternate ease-in-out !important;
      border-width: 2px !important; backdrop-filter: blur(8px) !important; transition: all 0.3s ease;
    }

    /* BUG 4 FIX — Expired claim pulsing effect (amber, distinct from EOC red) */
    @keyframes pulsyGlassyAmber {
      0%   { box-shadow: 0 0 0 0 rgba(217,119,6,0.55), inset 0 0 10px rgba(217,119,6,0.1);
              background-color: rgba(255,251,235,0.45); border-color: rgba(245,158,11,0.5); }
      100% { box-shadow: 0 0 22px 9px rgba(217,119,6,0), inset 0 0 32px rgba(217,119,6,0.2);
              background-color: rgba(255,251,235,0.9); border-color: rgba(217,119,6,1); }
    }
    .flight-card.expired-alert-active {
      animation: pulsyGlassyAmber 1.8s infinite alternate ease-in-out !important;
      border-width: 2px !important; backdrop-filter: blur(8px) !important; transition: all 0.3s ease;
    }
    /* When both EOC and expired fire simultaneously, EOC red takes precedence */
    .flight-card.eoc-alert-active.expired-alert-active {
      animation: pulsyGlassyRed 1.5s infinite alternate ease-in-out !important;
    }

    @keyframes yearBtnPulse {
      0%   { box-shadow: 0 0 0 0 rgba(37,99,235,0.7); }
      65%  { box-shadow: 0 0 0 12px rgba(37,99,235,0); }
      100% { box-shadow: 0 0 0 0 rgba(37,99,235,0); }
    }
    #applyYearBtn { animation: yearBtnPulse 1.6s infinite; }
    #applyYearBtn:disabled { animation: none; opacity: 0.7; }

    @keyframes setDatePulse {
      0%   { box-shadow: 0 0 0 0 rgba(37,99,235,0.5); }
      65%  { box-shadow: 0 0 0 8px rgba(37,99,235,0); }
      100% { box-shadow: 0 0 0 0 rgba(37,99,235,0); }
    }
    .fc-date-set-btn { animation: setDatePulse 2s infinite; }
    .fc-date-set-btn:disabled { animation: none; }

    .fc-date-edit-btn {
      background: none; border: none; cursor: pointer; font-size: 11px; padding: 2px 4px;
      color: #94a3b8; border-radius: 3px; line-height: 1; transition: color 0.2s, background 0.2s;
    }
    .fc-date-edit-btn:hover { color: #2563eb; background: #eff6ff; }

    .fc-date-edit-row {
      display: inline-flex; align-items: center; gap: 5px; background: #f0f9ff;
      border: 1px solid #bae6fd; padding: 3px 8px; border-radius: 8px;
    }
    .fc-date-edit-row input[type="date"] {
      border: none; background: transparent; font-size: 12px; color: #0f172a;
      outline: none; cursor: pointer; font-weight: 600; max-width: 140px;
    }
    .fc-date-confirm-btn {
      background: #2563eb; color: white; border: none; border-radius: 4px;
      padding: 3px 8px; font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap;
    }
    .fc-date-cancel-btn {
      background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; border-radius: 4px;
      padding: 3px 6px; font-size: 11px; font-weight: 700; cursor: pointer;
    }

    /* Rescheduled badge */
    .fc-rescheduled-badge {
      background: #fef3c7; color: #92400e; border: 1px solid #fde68a;
      padding: 6px 12px; border-radius: 6px; font-weight: 800; font-size: 12px;
      margin-bottom: 12px; margin-right: 8px; display: inline-block;
    }
    .fc-original-time {
      font-size: 13px; color: #94a3b8; text-decoration: line-through;
      margin-right: 6px; font-weight: 600;
    }
    .fc-new-time-arrow { color: #f59e0b; font-weight: 800; margin-right: 6px; font-size: 13px; }
    .fc-new-time { color: #b45309; font-weight: 800; font-size: 15px; }

    .pnr-editable { outline:none; color:var(--primary); font-weight:800; min-width:85px; display:inline-block; word-break:break-word; max-width:100%; text-transform:uppercase; cursor:text; }
    .pnr-editable:empty:before { content: attr(data-placeholder); color: #94a3b8; pointer-events: none; }

    /* PHASE 3: MULTI-PNR COLOR CODING SYSTEM */
    :root {
      --pnr-color-1: #2563eb;
      --pnr-bg-1: #eff6ff;
      --pnr-border-1: #bfdbfe;

      --pnr-color-2: #7c3aed;
      --pnr-bg-2: #f5f3ff;
      --pnr-border-2: #ddd6fe;

      --pnr-color-3: #059669;
      --pnr-bg-3: #d1fae5;
      --pnr-border-3: #a7f3d0;

      --pnr-color-4: #dc2626;
      --pnr-bg-4: #fee2e2;
      --pnr-border-4: #fecaca;

      --pnr-color-5: #ea580c;
      --pnr-bg-5: #ffedd5;
      --pnr-border-5: #fed7aa;

      --pnr-color-6: #0891b2;
      --pnr-bg-6: #cffafe;
      --pnr-border-6: #a5f3fc;
    }

    .pnr-badge-1 {
      color: var(--pnr-color-1) !important;
      background: var(--pnr-bg-1) !important;
      border-color: var(--pnr-border-1) !important;
    }
    .pnr-badge-2 {
      color: var(--pnr-color-2) !important;
      background: var(--pnr-bg-2) !important;
      border-color: var(--pnr-border-2) !important;
    }
    .pnr-badge-3 {
      color: var(--pnr-color-3) !important;
      background: var(--pnr-bg-3) !important;
      border-color: var(--pnr-border-3) !important;
    }
    .pnr-badge-4 {
      color: var(--pnr-color-4) !important;
      background: var(--pnr-bg-4) !important;
      border-color: var(--pnr-border-4) !important;
    }
    .pnr-badge-5 {
      color: var(--pnr-color-5) !important;
      background: var(--pnr-bg-5) !important;
      border-color: var(--pnr-border-5) !important;
    }
    .pnr-badge-6 {
      color: var(--pnr-color-6) !important;
      background: var(--pnr-bg-6) !important;
      border-color: var(--pnr-border-6) !important;
    }

    .pnr-editable {
      transition: all 0.2s ease;
      border-bottom: 2px dashed transparent;
    }

    .pnr-editable:hover {
      border-bottom-color: currentColor;
      opacity: 0.8;
    }

    /* PHASE 2: COLLAPSIBLE SECTIONS IMPLEMENTATION */
    .fc-collapsible-section {
      width: 100%;
      margin-top: 12px;
      border-radius: 10px;
      overflow: hidden;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .fc-collapse-trigger {
      width: 100%;
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 14px;
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      font-size: 12px;
      font-weight: 700;
      color: #475569;
      text-align: left;
    }

    .fc-collapse-trigger:hover {
      background: linear-gradient(135deg, #eff6ff 0%, #e0e7ff 100%);
      border-color: #bfdbfe;
      color: #1e40af;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.1);
      transform: translateY(-1px);
    }

    .fc-collapse-icon {
      font-size: 10px;
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      color: #94a3b8;
      flex-shrink: 0;
    }

    .fc-collapse-trigger.expanded .fc-collapse-icon {
      transform: rotate(90deg);
      color: #2563eb;
    }

    .fc-collapse-content {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1),
                  opacity 0.3s ease,
                  padding 0.3s ease;
      opacity: 0;
      padding: 0 14px;
    }

    .fc-collapse-content.expanded {
      max-height: 2000px;
      opacity: 1;
      padding: 12px 14px;
    }

    .fc-collapsible-section:not(.expanded) .fc-collapse-trigger {
      animation: subtlePulse 3s infinite ease-in-out;
    }

    @keyframes subtlePulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
      50% { box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1); }
    }

    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  `;
  document.head.appendChild(styleEl);

  // ---------------------------------------------------------------------------
  // YEAR INPUT WRAPPER
  // ---------------------------------------------------------------------------
  if (ticketDropZone) {
    ticketDropZone.insertAdjacentHTML('beforebegin', `
      <div id="yearInputWrapper" style="margin-bottom:20px;background:#fffbeb;border:1px solid #fcd34d;padding:15px;border-radius:8px;">
        <label style="display:block;font-weight:800;color:#b45309;margin-bottom:6px;font-size:14px;">
          📅 Confirm Flight Year (Highly Recommended)
        </label>
        <div style="font-size:12px;color:#92400e;margin-bottom:12px;line-height:1.4;">
          Boarding passes often hide the year. Enter the year of travel (e.g., 2024) before
          analyzing to guarantee correct Jurisdiction &amp; Expiration calculations.
          If the year is printed on the document, that document year is always used instead.
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <input type="number" id="globalJourneyYear" placeholder="YYYY" min="2000" max="2050"
            style="width:100%;max-width:150px;padding:10px;border-radius:6px;border:1px solid #fbbf24;
                   outline:none;font-family:inherit;font-size:14px;text-align:center;">
          <button id="applyYearBtn" type="button"
            style="display:none;padding:10px 20px;background:#2563eb;color:#fff;border:none;
                   border-radius:6px;font-weight:800;font-size:14px;cursor:pointer;
                   align-items:center;gap:6px;white-space:nowrap;">
            Enter ✓
          </button>
        </div>
      </div>`);
  }

  // ---------------------------------------------------------------------------
  // FILE HANDLING
  // ---------------------------------------------------------------------------
  let currentFiles = [], fetchAbortController = null;

  function updateUI() {
    if (!currentFiles.length) { previewTicket.style.display = 'none'; resultsCard.style.display = 'none'; return; }
    ticketName.innerText = currentFiles.length === 1 ? `📄 1 File Ready: ${currentFiles[0].name}` : `📄 ${currentFiles.length} Files Ready`;
    previewTicket.style.display = 'block';
  }

  clearBtn.addEventListener('click', () => { currentFiles = []; ticketInput.value = ''; if (fetchAbortController) fetchAbortController.abort(); updateUI(); });
  ticketDropZone.addEventListener('click', () => ticketInput.click());
  ticketInput.addEventListener('change', (e) => { currentFiles = [...currentFiles, ...Array.from(e.target.files)]; updateUI(); });
  ticketDropZone.addEventListener('dragover', (e) => { e.preventDefault(); ticketDropZone.classList.add('dragover'); });
  ticketDropZone.addEventListener('dragleave', (e) => { e.preventDefault(); ticketDropZone.classList.remove('dragover'); });
  ticketDropZone.addEventListener('drop', (e) => { e.preventDefault(); ticketDropZone.classList.remove('dragover'); if (e.dataTransfer.files.length) { currentFiles = [...currentFiles, ...Array.from(e.dataTransfer.files)]; updateUI(); } });

  document.addEventListener('paste', (e) => {
    const cb = e.clipboardData || window.clipboardData;
    if (!cb?.items) return;
    const pf = [];
    for (const item of cb.items) {
      if (item.type.startsWith('image/') || item.type === 'application/pdf') {
        const f = item.getAsFile(), ext = f.type.split('/')[1] || 'png';
        pf.push(new File([f], `Pasted_${Date.now()}.${ext}`, { type: f.type }));
      }
    }
    if (pf.length) { currentFiles = [...currentFiles, ...pf]; updateUI(); }
  });

  // ---------------------------------------------------------------------------
  // STATUS BADGE RENDERER — exact-match, never substring
  // ---------------------------------------------------------------------------
  function normalizeStatus(raw) { return (raw || '').toLowerCase().trim(); }

  function buildStatusBadges(flightStatus, flight) {
    const s = normalizeStatus(flightStatus);

    if (s === 'cancelled') {
      return { html: `<div style="background:#fee2e2;color:#dc2626;padding:6px 12px;border-radius:6px;font-weight:800;font-size:12px;margin-bottom:16px;margin-right:8px;display:inline-block;border:1px solid #fecaca;">✈️ FLIGHT CANCELLED BY AIRLINE</div>`, opacity: '0.55', isRescheduled: false };
    }
    if (s === 'unused / missed connection') {
      return { html: `<div style="background:#f1f5f9;color:#475569;padding:6px 12px;border-radius:6px;font-weight:800;font-size:12px;margin-bottom:16px;margin-right:8px;display:inline-block;border:1px dashed #cbd5e1;">🚶 MISSED CONNECTION / UNUSED TICKET</div>`, opacity: '0.65', isRescheduled: false };
    }
    if (s === 'replacement flight') {
      return { html: `<div style="background:#e0e7ff;color:#3730a3;padding:6px 12px;border-radius:6px;font-weight:800;font-size:12px;margin-bottom:16px;margin-right:8px;display:inline-block;border:1px solid #c7d2fe;">🔄 REPLACEMENT FLIGHT</div>`, opacity: '1', isRescheduled: false };
    }
    if (s === 'unused replacement flight') {
      return {
        html: `<div style="background:#e0e7ff;color:#3730a3;padding:6px 12px;border-radius:6px;font-weight:800;font-size:12px;margin-bottom:16px;margin-right:8px;display:inline-block;border:1px solid #c7d2fe;">🔄 REPLACEMENT FLIGHT</div>` +
          `<div style="background:#f1f5f9;color:#475569;padding:6px 12px;border-radius:6px;font-weight:800;font-size:12px;margin-bottom:16px;margin-right:8px;display:inline-block;border:1px dashed #cbd5e1;">🚶 MISSED CONNECTION / UNUSED</div>`,
        opacity: '0.65', isRescheduled: false,
      };
    }
    if (s === 'rescheduled') {
      const origDep = flight.originalDepartureTime && flight.originalDepartureTime !== '--:--' ? flight.originalDepartureTime : null;
      const origArr = flight.originalArrivalTime && flight.originalArrivalTime !== '--:--' ? flight.originalArrivalTime : null;
      let timeChangeHtml = '';
      if (origDep) {
        timeChangeHtml = `
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin-top:4px;">
            <span style="font-size:11px;color:#64748b;font-weight:700;margin-right:4px;">Dep:</span>
            <span class="fc-original-time">${origDep}</span>
            <span class="fc-new-time-arrow">→</span>
            <span class="fc-new-time">${flight.departureTime || '--:--'}</span>
            ${origArr ? `<span style="font-size:11px;color:#64748b;font-weight:700;margin-left:10px;margin-right:4px;">Arr:</span><span class="fc-original-time">${origArr}</span><span class="fc-new-time-arrow">→</span><span class="fc-new-time">${flight.arrivalTime || '--:--'}</span>` : ''}
          </div>`;
      }
      return { html: `<div class="fc-rescheduled-badge">🕐 RESCHEDULED — TIME CHANGE${timeChangeHtml}</div>`, opacity: '1', isRescheduled: true };
    }
    return { html: '', opacity: '1', isRescheduled: false };
  }

  // ---------------------------------------------------------------------------
  // DATE HELPERS
  // ---------------------------------------------------------------------------
  function classifyDate(raw) {
    const MISSING = ['', 'unknown', 'not provided', 'n/a', 'not available', 'none', 'null'];
    if (!raw || MISSING.includes(raw.trim().toLowerCase())) return 'missing';
    if (/\d{4}/.test(raw)) return 'full';
    return 'partial';
  }

  function buildFullDate(partial, year) {
    if (!partial || !year) return null;
    const y = String(year).trim();
    if (!/^\d{4}$/.test(y)) return null;
    const mo = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12', january: '01', february: '02', march: '03', april: '04', june: '06', july: '07', august: '08', september: '09', october: '10', november: '11', december: '12' };
    const m1 = partial.trim().match(/^(\d{1,2})\s+([A-Za-z]+)$/);
    if (m1 && mo[m1[2].toLowerCase()]) return `${y}-${mo[m1[2].toLowerCase()]}-${m1[1].padStart(2, '0')}`;
    const m2 = partial.trim().match(/^([A-Za-z]+)\s+(\d{1,2})$/);
    if (m2 && mo[m2[1].toLowerCase()]) return `${y}-${mo[m2[1].toLowerCase()]}-${m2[2].padStart(2, '0')}`;
    const p = new Date(`${partial} ${y}`);
    if (!isNaN(p.getTime())) return `${y}-${String(p.getMonth() + 1).padStart(2, '0')}-${String(p.getDate()).padStart(2, '0')}`;
    return null;
  }

  // ---------------------------------------------------------------------------
  // BUG 3 + BUG 4 FIX — updateExpirationBadge
  // Now reads data-years correctly (server always sends them even when date was
  // missing), and toggles the expired-alert-active class on the parent card.
  // ---------------------------------------------------------------------------
  function updateExpirationBadge(container, fullDate) {
    const rawYears = container.dataset.years;
    const country = container.dataset.country;

    // Tolerate 'N/A', 'undefined', or actual missing values
    const yearsInvalid = !rawYears || rawYears === 'N/A' || rawYears === 'undefined' || rawYears === 'null';

    const card = container.closest('.flight-card');

    if (yearsInvalid) {
      container.innerHTML = `<div class="fc-exp-badge">⚠️ Jurisdiction limit unknown</div>`;
      // Nothing to expire, so remove class if it was lingering
      if (card) card.classList.remove('expired-alert-active');
      return;
    }

    const years = parseInt(rawYears, 10);
    if (isNaN(years)) {
      container.innerHTML = `<div class="fc-exp-badge" title="${country}">⏳ ${rawYears}</div>`;
      if (card) card.classList.remove('expired-alert-active');
      return;
    }

    const fd = new Date(fullDate);
    if (isNaN(fd.getTime())) {
      container.innerHTML = `<div class="fc-exp-badge">⚠️ Cannot calculate expiry</div>`;
      if (card) card.classList.remove('expired-alert-active');
      return;
    }

    const exp = new Date(fd);
    exp.setFullYear(exp.getFullYear() + years);
    const expStr = exp.toISOString().split('T')[0];
    const expired = new Date() > exp;

    if (expired) {
      container.innerHTML = `<div class="fc-exp-badge expired" title="Deadline was ${expStr} (${country})">🚨 CLAIM EXPIRED</div>`;
      // BUG 4: Add amber pulsing class to the flight card
      if (card) card.classList.add('expired-alert-active');
    } else {
      container.innerHTML = `<div class="fc-exp-badge" title="Valid under ${country} law (${years} years)">⏳ Valid to ${expStr}</div>`;
      // Remove expired class in case a date edit fixed an apparent expiry
      if (card) card.classList.remove('expired-alert-active');
    }
  }

  async function runEOCCheck(eocWrapper, flightCard) {
    const { date, oiata, diata, ocountry, dcountry } = eocWrapper.dataset;
    flightCard.classList.remove('eoc-alert-active');
    flightCard.querySelectorAll('.eoc-flight-alert').forEach(el => el.remove());
    if (!date || date === 'Unknown' || !/\d{4}/.test(date)) {
      eocWrapper.innerHTML = `<div style="background:#fef2f2;color:#dc2626;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid #fecaca;">⚠️ Date Incomplete — No EOC Check</div>`;
      return;
    }
    eocWrapper.innerHTML = `<div style="background:#f8fafc;color:#475569;border:1px dashed #cbd5e1;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;">⏳ Checking EOC...</div>`;
    try {
      const r = await fetch(`/api/check-eoc?date=${encodeURIComponent(date)}&originIata=${encodeURIComponent(oiata)}&destIata=${encodeURIComponent(diata)}&originCountry=${encodeURIComponent(ocountry)}&destCountry=${encodeURIComponent(dcountry)}`);
      const d = await r.json();
      if (d.eocFound && d.events?.length) {
        flightCard.classList.add('eoc-alert-active');
        const bt = d.events.length > 1 ? `${d.events.length} EOCs Found` : `EOC Found`;
        const hdr = d.events.length > 1 ? `⚠️ MULTIPLE EXTRAORDINARY CIRCUMSTANCES DETECTED (${d.events.length})` : `⚠️ EXTRAORDINARY CIRCUMSTANCE DETECTED`;
        eocWrapper.innerHTML = `<div style="background:#fef2f2;color:#991b1b;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid #fecaca;" title="Claim may be invalidated by EOC">🚨 ${bt}</div>`;
        const evHtml = d.events.map((ev, i) => `
          <div style="${i > 0 ? 'margin-top:12px;padding-top:12px;border-top:1px dashed #fca5a5;' : ''}color:#450a0a;display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;align-items:baseline;">
            <strong style="color:#991b1b;">Category:</strong><span>${ev.category}</span>
            <strong style="color:#991b1b;">Event:</strong><span>${ev.event}</span>
            <strong style="color:#991b1b;">Location:</strong><span>${ev.location}</span>
            <strong style="color:#991b1b;">Decision:</strong><span style="font-weight:800;color:#dc2626;">${ev.decision}</span>
          </div>`).join('');
        const alert = document.createElement('div');
        alert.className = 'eoc-flight-alert';
        alert.style.cssText = 'margin-top:16px;background:#fef2f2;border:1px solid #fecaca;border-left:4px solid #ef4444;padding:16px;border-radius:8px;font-size:13px;color:#7f1d1d;line-height:1.6;animation:fadeIn 0.4s ease;box-shadow:0 4px 6px -1px rgba(239,68,68,0.1);';
        alert.innerHTML = `<div style="font-weight:800;color:#dc2626;margin-bottom:12px;text-transform:uppercase;font-size:12px;letter-spacing:0.5px;">${hdr}</div>${evHtml}`;
        flightCard.appendChild(alert);
      } else {
        eocWrapper.innerHTML = `<div style="background:#dcfce7;color:#166534;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid #bbf7d0;">✅ No EOC Found</div>`;
      }
    } catch (err) {
      eocWrapper.innerHTML = `<div style="background:#fef2f2;color:#991b1b;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid #fecaca;">❌ EOC Check Failed</div>`;
    }
  }

  async function applyDateToCard(flightCard, fullDate) {
    const wrapper = flightCard.querySelector('.fc-date-pill-wrapper');
    if (wrapper) {
      wrapper.style.cssText = 'display:inline-flex;align-items:center;gap:4px;';
      wrapper.innerHTML = `
        <span class="fc-date-pill" style="background:#dcfce7;color:#166534;border:1px solid #bbf7d0;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;">📅 ${fullDate}</span>
        <button class="fc-date-edit-btn" type="button" title="Edit date">✏️</button>`;
    }
    const eocW = flightCard.querySelector('.fc-eoc-wrapper');
    if (eocW) { eocW.dataset.date = fullDate; await runEOCCheck(eocW, flightCard); }

    // BUG 3 FIX: expiry badge now works even when server sent date-free cards,
    // because server always sets data-years/data-country regardless of date.
    const expC = flightCard.querySelector('.exp-badge-container');
    if (expC) updateExpirationBadge(expC, fullDate);

    flightCard.querySelectorAll('.btn-check-status').forEach(b => b.dataset.date = fullDate);
    flightCard.dataset.confirmedDate = fullDate;
  }

  function showDateEditor(flightCard, currentDate) {
    const wrapper = flightCard.querySelector('.fc-date-pill-wrapper');
    if (!wrapper) return;
    const savedHtml = wrapper.innerHTML, savedStyle = wrapper.style.cssText;
    wrapper.style.cssText = 'display:inline-flex;';
    wrapper.innerHTML = `
      <div class="fc-date-edit-row">
        <span style="font-size:12px;font-weight:700;color:#0369a1;white-space:nowrap;">📅 Edit:</span>
        <input type="date" class="fc-inline-date-picker" value="${currentDate || ''}">
        <button class="fc-date-confirm-btn" type="button">✓ Confirm</button>
        <button class="fc-date-cancel-btn" type="button">✕</button>
      </div>`;
    wrapper.querySelector('.fc-date-cancel-btn').addEventListener('click', () => { wrapper.style.cssText = savedStyle; wrapper.innerHTML = savedHtml; });
    wrapper.querySelector('.fc-date-confirm-btn').addEventListener('click', async () => {
      const picker = wrapper.querySelector('.fc-inline-date-picker');
      if (!picker?.value) { alert('Please select a date first.'); return; }
      const btn = wrapper.querySelector('.fc-date-confirm-btn');
      btn.disabled = true; btn.textContent = '⏳';
      await applyDateToCard(flightCard, picker.value);
    });
  }

  // ---------------------------------------------------------------------------
  // "ENTER ✓" YEAR BUTTON — shown only when the input is empty after analysis
  // ---------------------------------------------------------------------------
  document.getElementById('applyYearBtn').addEventListener('click', async function () {
    const year = (document.getElementById('globalJourneyYear').value || '').trim();
    if (!year || !/^\d{4}$/.test(year)) { alert('Please enter a valid 4-digit year (e.g. 2024)'); return; }
    this.disabled = true; this.textContent = '⏳ Updating...';
    const promises = [];
    document.querySelectorAll('.flight-card[data-partial-date]').forEach(card => {
      const partial = card.dataset.partialDate;
      if (!partial || partial === 'Unknown' || /\d{4}/.test(partial)) return;
      const full = buildFullDate(partial, year);
      if (full) promises.push(applyDateToCard(card, full));
    });
    await Promise.all(promises);
    const remaining = [...document.querySelectorAll('.flight-card[data-partial-date]')]
      .filter(c => { const p = c.dataset.partialDate; return p && p !== 'Unknown' && !/\d{4}/.test(p); });
    this.style.display = remaining.length ? 'inline-flex' : 'none';
    this.disabled = false; this.textContent = 'Enter ✓';
  });

  // ---------------------------------------------------------------------------
  // PNR COLOR ASSIGNMENT LOGIC
  // ---------------------------------------------------------------------------
  function assignPNRColors(journeys) {
    // Collect all unique PNRs across all journeys
    const allPNRs = new Set();

    journeys.forEach(journey => {
      if (journey.routes) {
        journey.routes.forEach(route => {
          if (route.legs) {
            route.legs.forEach(leg => {
              const pnr = leg.pnr;
              if (pnr && pnr !== 'Not Provided' && pnr !== 'Unknown') {
                allPNRs.add(pnr.trim().toUpperCase());
              }
            });
          }
        });
      }
    });

    // Create PNR to color mapping
    const pnrColorMap = {};
    const uniquePNRArray = Array.from(allPNRs).sort(); // Sort for consistency

    uniquePNRArray.forEach((pnr, i) => {
      const colorIndex = (i % 6) + 1; // Cycle through 6 colors
      pnrColorMap[pnr] = colorIndex;
    });

    return pnrColorMap;
  }

  // ---------------------------------------------------------------------------
  // MAIN ANALYSIS
  // ---------------------------------------------------------------------------
  analyzeBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!currentFiles.length) return alert('Please upload a ticket or boarding pass first.');

    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = '<div class="modern-spinner" style="width:20px;height:20px;border-width:2px;margin:0 auto;"></div>';
    resultsCard.style.display = 'none';

    const applyYearBtn = document.getElementById('applyYearBtn');
    applyYearBtn.style.display = 'none'; applyYearBtn.disabled = false; applyYearBtn.textContent = 'Enter ✓';

    const startTime = Date.now();
    const liveTimer = document.getElementById('liveTimer');
    const timerInterval = setInterval(() => { if (liveTimer) liveTimer.innerText = `${((Date.now() - startTime) / 1000).toFixed(1)}s`; }, 100);

    if (fetchAbortController) fetchAbortController.abort();
    fetchAbortController = new AbortController();

    const fd = new FormData();
    currentFiles.forEach(f => fd.append('ticket', f));
    const globalYear = document.getElementById('globalJourneyYear')?.value;
    if (globalYear) fd.append('journeyYear', globalYear);

    try {
      const res = await fetch('/api/analyze-ticket', { method: 'POST', body: fd, signal: fetchAbortController.signal });
      if (!res.ok) { const ed = await res.json().catch(() => ({})); throw new Error(ed.message || `Server error: ${res.status}`); }

      const raw = await res.json();
      resultsCard.innerHTML = ''; resultsCard.style.display = 'block';

      if (raw.noFlightData) {
        resultsCard.innerHTML = `<div style="text-align:center;padding:48px 24px;background:#fff7ed;border:1px dashed #fed7aa;border-radius:12px;color:#9a3412;"><div style="font-size:48px;margin-bottom:16px;">🚫✈️</div><div style="font-size:18px;font-weight:700;margin-bottom:8px;">No Flight Information Found</div><div style="font-size:14px;color:#c2410c;">This document doesn't contain any flight information.<br>Please upload a boarding pass, e-ticket, or itinerary.</div></div>`;
        return;
      }

      let dataArray = raw.journeys || raw;
      if (!Array.isArray(dataArray)) dataArray = [dataArray];

      // Assign PNR colors before rendering
      const pnrColorMap = assignPNRColors(dataArray);

      if (raw.processingTime) {
        resultsCard.innerHTML += `
          <div style="display:flex;justify-content:flex-end;align-items:center;margin-bottom:15px;gap:10px;flex-wrap:wrap;">
            <span style="background:#e2e8f0;color:#475569;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:700;">⏱️ Processed in ${raw.processingTime}s</span>
            ${raw.costUSD ? `<span style="background:#dcfce7;color:#166534;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:800;border:1px solid #bbf7d0;">💸 ${raw.costUSD}</span>` : ''}
          </div>`;
      }

      let hasMissingPnr = false, hasMissingYear = false, hasDifferentPnrs = false;
      const uniquePnrValues = new Set();

      dataArray.forEach(j => (j.routes || []).forEach(r => (r.legs || []).forEach(leg => {
        if (!leg.pnr || leg.pnr === 'Not Provided' || leg.pnr.toLowerCase().includes('scan') || leg.pnr === 'Unknown') {
          hasMissingPnr = true;
        } else {
          uniquePnrValues.add(leg.pnr.trim().toUpperCase());
        }
        if (classifyDate(leg.date) === 'partial') hasMissingYear = true;
      })));

      // Show success banner only if multiple different PNRs and no missing PNRs
      hasDifferentPnrs = uniquePnrValues.size > 1 && !hasMissingPnr;

      if (hasMissingPnr) {
        resultsCard.innerHTML += `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-left:4px solid #3b82f6;padding:14px 18px;border-radius:8px;margin-bottom:24px;"><div style="display:flex;align-items:center;gap:8px;font-weight:800;color:#1e3a8a;margin-bottom:6px;font-size:14px;"><span>📱</span> Missing PNRs Detected</div><div style="color:#1e40af;font-size:13px;line-height:1.5;">One or more True PNRs could not be clearly extracted. <b>Please use your scanner to read the barcode and edit the PNR field below.</b></div></div>`;
      }

      if (hasDifferentPnrs) {
        resultsCard.innerHTML += `<div style="background:#cffafe;border:1px solid #67e8f9;border-left:4px solid #0891b2;padding:12px 16px;border-radius:8px;margin-bottom:24px;"><div style="display:flex;align-items:center;gap:6px;font-weight:700;color:#0c4a6e;font-size:13px;"><span>📋</span> ${uniquePnrValues.size} Different PNRs Detected</div></div>`;
      }

      dataArray.forEach((data, ji) => {
        const jw = document.createElement('div');
        jw.style.marginBottom = '60px';
        jw.style.borderBottom = ji < dataArray.length - 1 ? '3px dashed var(--border-soft)' : 'none';
        jw.style.paddingBottom = ji < dataArray.length - 1 ? '40px' : '0';
        if (dataArray.length > 1) jw.innerHTML += `<h3 style="color:var(--primary);border-bottom:1px solid var(--border-soft);padding-bottom:10px;">🎫 Ticket / Journey ${ji + 1}</h3>`;

        if (data.ec261 || data.routes?.length) {
          let el = [], il = [];
          (data.routes || []).forEach(r => (r.legs || []).forEach(leg => {
            if (leg.ec261Leg?.status) {
              const ok = !leg.ec261Leg.status.toLowerCase().includes('not');
              const s = `<b>${leg.originIata || '?'} ➔ ${leg.destinationIata || '?'}</b>: ${leg.ec261Leg.reason}`;
              (ok ? el : il).push(s);
            }
          }));
          let cc, ico, th, rh, is_ = '';
          if (el.length && il.length) {
            cc = 'partially-eligible'; is_ = 'background-color:#fffbeb;border:1px solid #fde68a;'; ico = '<span style="color:#d97706;">⚠️</span>'; th = '<h4 class="ec-title" style="color:#b45309;">OVERALL CLAIM: MIXED ELIGIBILITY</h4>';
            rh = `<p class="ec-reason" style="margin-bottom:8px;color:#92400e;">This journey contains a mix of eligible and legally ineligible flight legs.</p><div style="display:flex;flex-direction:column;gap:8px;background:rgba(255,255,255,0.6);padding:12px;border-radius:8px;border:1px dashed #fcd34d;"><div style="color:#15803d;font-size:13px;line-height:1.4;">✅ ${el.join('<br>✅ ')}</div><div style="color:#b91c1c;font-size:13px;line-height:1.4;margin-top:4px;padding-top:8px;border-top:1px dashed #fde68a;">❌ ${il.join('<br>❌ ')}</div></div>`;
          } else {
            const ok = el.length > 0 && !il.length; const st = data.ec261 ? data.ec261.status.toUpperCase() : 'UNKNOWN'; const re = data.ec261 ? data.ec261.reason : '';
            cc = ok ? 'eligible' : 'not-eligible'; ico = ok ? '🛡️' : '🚫'; th = `<h4 class="ec-title">OVERALL CLAIM: ${el.length ? 'ELIGIBLE' : il.length ? 'NOT ELIGIBLE' : st}</h4>`; rh = `<p class="ec-reason">${re}</p>`;
          }
          jw.innerHTML += `<div class="ec261-card ${cc}" style="${is_}"><div class="ec-icon">${ico}</div><div class="ec-content">${th}${rh}</div></div>`;
        }
        const fcc = document.createElement('div');

        if (data.routes?.length) {
          data.routes.forEach(route => {
            fcc.innerHTML += `<div class="route-header">${route.type || 'Flight Route'}</div>`;

            (route.legs || []).forEach((flight, idx) => {
              const legIndicator = route.legs.length > 1 ? `Leg ${idx + 1}` : 'Direct';
              const dateCls = classifyDate(flight.date);
              const isMissing = dateCls === 'missing';
              const isPartial = dateCls === 'partial';

              const { html: swarn, opacity: opa, isRescheduled } = buildStatusBadges(flight.flightStatus, flight);

              let legBadge = '';
              if (flight.ec261Leg?.status) {
                const ok = !flight.ec261Leg.status.toLowerCase().includes('not');
                legBadge = `<div class="fc-ec-badge ${ok ? 'eligible' : 'not-eligible'}" title="${flight.ec261Leg.reason}">${ok ? '✅' : '❌'} ${flight.ec261Leg.status}</div>`;
                if (ok && flight.ec261Leg.estimatedClaimValue && flight.ec261Leg.estimatedClaimValue !== 'N/A') legBadge += `<div class="leg-claim-value">💸 ${flight.ec261Leg.estimatedClaimValue}</div>`;
              }

              let expBadge = '', expYears = 'N/A', expCountry = 'N/A', originSt = '', destSt = '';
              // BUG 3 FIX: Server now always sends bestYears/bestCountry even when date is
              // missing, so we always store them on the DOM container as data attributes.
              // updateExpirationBadge can then compute expiry as soon as a date is set.
              if (flight.ec261Leg?.claimExpiration) {
                const exp = flight.ec261Leg.claimExpiration;
                expYears = exp.bestYears ?? 'N/A';
                expCountry = exp.bestCountry ?? 'N/A';
                const fmt = v => (!v || v === 'N/A' || String(v).toLowerCase().includes('not applicable')) ? 'N/A' : (String(v).toLowerCase().includes('year') ? v : `${v} years`);
                if (exp.originYears) originSt = `<div style="font-size:11px;color:#d97706;font-weight:700;margin-top:6px;letter-spacing:0.3px;">⚖️ Limit: ${fmt(exp.originYears)}</div>`;
                if (exp.destinationYears) destSt = `<div style="font-size:11px;color:#d97706;font-weight:700;margin-top:6px;text-align:right;letter-spacing:0.3px;">⚖️ Limit: ${fmt(exp.destinationYears)}</div>`;
                if (isMissing) expBadge = `<div class="fc-exp-badge" style="background:#fef08a;color:#9a3412;border:1px dashed #fde047;">⚠️ Set date to verify expiry</div>`;
                else if (isPartial) expBadge = `<div class="fc-exp-badge" style="background:#fef08a;color:#9a3412;border:1px dashed #fde047;">⚠️ Enter year to verify expiry</div>`;
                else if (exp.isExpired) expBadge = `<div class="fc-exp-badge expired" title="Deadline was ${exp.expirationDate} (${exp.bestCountry})">🚨 CLAIM EXPIRED</div>`;
                else expBadge = `<div class="fc-exp-badge" title="Valid under ${exp.bestCountry} law (${exp.bestYears} years)">⏳ Valid to ${exp.expirationDate}</div>`;
              }

              const mkt = flight.marketingAirline || 'Unknown', op = flight.operatingAirline || mkt;
              const airText = mkt === op ? `✈️ Operated by: ${op}` : `✈️ Booked: ${mkt} <span style="color:var(--primary);margin-left:8px;">| Operated by: ${op}</span>`;
              const distHtml = flight.distanceKm ? `<div style="position:absolute;top:-20px;font-size:10px;font-weight:700;color:var(--text-muted);background:var(--surface);padding:2px 8px;border-radius:10px;border:1px solid var(--border-soft);z-index:3;letter-spacing:0.5px;">${flight.distanceKm}</div>` : '';
              const depTimeDisplay = isRescheduled ? `<span style="font-size:13px;color:#94a3b8;">See reschedule details above</span>` : (flight.departureTime || '--:--');
              const arrTimeDisplay = isRescheduled ? `<span style="font-size:13px;color:#94a3b8;">—</span>` : (flight.arrivalTime || '--:--');

              let docsHtml = '';
              if (flight.claimDocuments?.length) {
                const ftAirlines = ['air france', 'buzz', 'corsair', 'easyjet', 'gulf air', 'klm', 'ryanair'];
                const tpAirlines = ['nouvelair', '4airways', 'aero contractors', 'aeromexico', 'air albania', 'air cairo', 'air china', 'air corsica', 'corse mediterranee', 'air india', 'air mediterranean', 'air namibia', 'air nippon', 'air peace', 'air saint pierre', 'air senegal', 'air transat', 'air wisconsin', 'akasa air', 'american airlines', 'anima wings', 'arkia', 'atlantic airways', 'austrian', 'avianca', 'avies', 'azerbaijan', 'azul', 'bluebird', 'boliviana', 'corendon', 'egyptair', 'emerald', 'emirates', 'estelar', 'ethiopian', 'euroairlines', 'fly lili', 'flyegypt', 'flynas', 'gol', 'gp aviation', 'hainan', 'hisky', 'icelandair', 'kuwait', 'la compagnie', 'lauda', 'nesma', 'nile air', 'nouvel air', 'oman air', 'pakistan international', 'pegasus', 'plus ultra', 'royal air maroc', 'sky vision', 'skywest', 't way', 'tap', 'tarom', 'tassili', 'thai airways', 'tianjin', 'tui', 'tuifly', 'tunisair', 'turkish', 'vietnam'];
                const ceasedAirlines = ['aeroitalia', 'air antilles', 'aerosvit', 'air berlin', 'air contractors', 'air italy', 'air lituanica', 'air mediterranee', 'air one', 'air onix', 'air sweden', 'air via', 'albawings', 'alitalia', 'amerijet', 'augsburg', 'bees ukraine', 'belle air', 'bingo airways', 'blue air', 'blue islands', 'blue panorama', 'blue1', 'bmi regional', 'cameroon airlines', 'cimber', 'continental airlines', 'donavia', 'eastern airways', 'estonian air', 'eurolot', 'expressjet', 'fly romania', 'flybe', 'german sky', 'german wings', 'germania', 'hamburg airways', 'hop brit air', 'iceland express', 'insel air', 'khors air', 'lotus airline', 'malev hungarian', 'malmo aviation', 'martin air', 'meridiana', 'monarch', 'motor sich', 'next jet', 'niki', 'nordstar', 'novair', 'onur air', 'openskies', 'orbest portugal', 'palestine airlines', 'piedmont', 'play', 'polet', 'primera air', 'skywings', 'skywork', 'small planet', 'ten airways', 'thomas cook belgium', 'thomas cook uk', 'trans states', 'transaero', 'tyrolean', 'us airways', 'vim', 'voepass', 'wizzair abu dhabi', 'xl airways france', 'braathens international', 'air togo', 'air albania', 'albanian airlines'];
                const directAirlines = ['wizz air', 'airbaltic', 'transavia', 'jet2', 'ryanair', 'easyjet'];
                const cleanStr = (s) => ' ' + String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ') + ' ';

                const docsContent = flight.claimDocuments.map(doc => {
                  const def = doc.reqs === 'No documents required';
                  const rp = doc.role ? `<span style="background:#f1f5f9; color:#64748b; font-size:10px; padding:2px 6px; border-radius:4px; border:1px solid #cbd5e1; text-transform:uppercase; font-weight:800;">${doc.role}</span>` : '';

                  const cName = cleanStr(doc.airline);
                  const isFT = ftAirlines.some(a => cName.includes(' ' + a + ' '));
                  const isTP = tpAirlines.some(a => cName.includes(' ' + a + ' '));
                  const isCeased = ceasedAirlines.some(a => cName.includes(' ' + a + ' '));
                  const isDirect = directAirlines.some(a => cName.includes(' ' + a + ' '));

                  let tagsHtml = '';
                  if (isCeased) tagsHtml += `<span style="background:#fef2f2; color:#b91c1c; font-size:10px; padding:2px 8px; border-radius:12px; border:1px solid #fecaca; text-transform:uppercase; font-weight:800; margin-left:6px; white-space:nowrap; box-shadow:0 1px 2px rgba(0,0,0,0.05); display:inline-block; vertical-align:middle;">🚨 CEASED OPERATIONS</span>`;
                  if (isFT) tagsHtml += `<span style="background:#fefce8; color:#a16207; font-size:10px; padding:2px 8px; border-radius:12px; border:1px solid #fde047; text-transform:uppercase; font-weight:800; margin-left:6px; white-space:nowrap; box-shadow:0 1px 2px rgba(0,0,0,0.05); display:inline-block; vertical-align:middle;">⚡ FAST TRACK</span>`;
                  if (isDirect) tagsHtml += `<span style="background:#eef2ff; color:#4338ca; font-size:10px; padding:2px 8px; border-radius:12px; border:1px solid #c7d2fe; text-transform:uppercase; font-weight:800; margin-left:6px; white-space:nowrap; box-shadow:0 1px 2px rgba(0,0,0,0.05); display:inline-block; vertical-align:middle;">✈️ DIRECT FLIGHT OPERATOR</span>`;
                  if (isTP) tagsHtml += `<span style="background:#f0fdf4; color:#15803d; font-size:10px; padding:2px 8px; border-radius:12px; border:1px solid #bbf7d0; text-transform:uppercase; font-weight:800; margin-left:6px; white-space:nowrap; box-shadow:0 1px 2px rgba(0,0,0,0.05); display:inline-block; vertical-align:middle;">🎫 TICKET NO = PNR</span>`;

                  let jb = '';
                  if (doc.hq && doc.limit) { const bc = doc.limit === 'N/A' ? '#94a3b8' : '#b45309', bb = doc.limit === 'N/A' ? '#f1f5f9' : '#fef3c7', be = doc.limit === 'N/A' ? '#e2e8f0' : '#fde68a'; jb = `<span style="background:${bb};color:${bc};padding:2px 8px;border-radius:12px;font-size:10px;font-weight:800;border:1px solid ${be};display:inline-block;white-space:nowrap;margin-left:6px;vertical-align:middle;">🏛️ ${doc.hq} (${doc.limit})</span>`; }

                  if (def) {
                    return `<div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:10px 14px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;"><div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">${rp}<span style="font-weight:800; color:#334155; font-size:13px; margin-top:1px;">${doc.airline}</span>${tagsHtml}${jb}</div><span style="font-weight:800; color:#059669; font-size:11px; background:#d1fae5; padding:3px 8px; border-radius:6px;">✅ No docs required</span></div>`;
                  } else {
                    return `<div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:12px 14px; display:flex; flex-direction:column; gap:10px;"><div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; border-bottom:1px dashed #bfdbfe; padding-bottom:10px;"><div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">${rp}<span style="font-weight:800; color:#1e3a8a; font-size:13px; margin-top:1px;">${doc.airline}</span>${tagsHtml}${jb}</div></div><div style="font-size:13px; color:#1e40af; line-height:1.5;"><span style="font-weight:800; color:#2563eb; letter-spacing:0.5px; margin-right:4px;">REQUIRED:</span> ${doc.reqs}</div></div>`;
                  }
                }).join('');

                docsHtml = `
                  <div class="fc-collapsible-section" data-section="docs">
                    <button class="fc-collapse-trigger" type="button" data-toggle-section="docs">
                      <span class="fc-collapse-icon">▶</span>
                      <span class="fc-collapse-label">📋 Mandatory Claim Documents</span>
                    </button>
                    <div class="fc-collapse-content">
                      <div style="padding-top:8px;display:flex;flex-direction:column;gap:10px;">
                        ${docsContent}
                      </div>
                    </div>
                  </div>
                `;
              }

              let stBtns = '', fnDisp = '';
              const fns = Array.isArray(flight.flightNumbers) ? flight.flightNumbers : [];
              if (fns.length) {
                fnDisp = fns.join(' <span style="color:#cbd5e1;font-weight:400;margin:0 4px;">/</span> ');
                fns.forEach(fn => { const c = fn.trim(); if (c && c !== 'N/A' && c !== 'Unknown') stBtns += `<button type="button" class="btn-check-status" data-flight="${c}" data-date="${flight.date || 'Unknown'}" data-origin="${flight.originIata || ''}" data-dest="${flight.destinationIata || ''}" style="margin-left:6px;background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1;border-radius:6px;padding:3px 9px;font-size:11px;font-weight:700;cursor:pointer;transition:0.2s;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;">📡 ${c} Stats</button>`; });
              } else { fnDisp = 'N/A'; }

              let datePillHtml = '';
              if (isMissing) {
                datePillHtml = `
                  <div class="fc-date-pill-wrapper" style="display:inline-flex;align-items:center;gap:6px;background:#fef2f2;border:1px dashed #fecaca;padding:4px 10px;border-radius:8px;">
                    <span style="font-size:12px;color:#dc2626;font-weight:700;white-space:nowrap;">📅 No Date —</span>
                    <input type="date" class="fc-inline-date-picker" style="border:none;background:transparent;font-size:12px;color:#0f172a;outline:none;cursor:pointer;font-weight:600;max-width:130px;">
                    <button class="fc-date-set-btn" type="button" style="background:#2563eb;color:white;border:none;border-radius:4px;padding:3px 8px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">✓ Set</button>
                  </div>`;
              } else if (isPartial) {
                datePillHtml = `
                  <div class="fc-date-pill-wrapper" style="display:inline-flex;align-items:center;gap:4px;">
                    <span class="fc-date-pill needs-date-warning" style="background:#fef08a;color:#9a3412;border:1px dashed #fde047;transition:0.3s;">📅 ${flight.date}</span>
                    <button class="fc-date-edit-btn" type="button" title="Edit date">✏️</button>
                  </div>`;
              } else {
                datePillHtml = `
                  <div class="fc-date-pill-wrapper" style="display:inline-flex;align-items:center;gap:4px;">
                    <span class="fc-date-pill">📅 ${flight.date}</span>
                    <button class="fc-date-edit-btn" type="button" title="Edit date">✏️</button>
                  </div>`;
              }

              const eocHtml = `
                <div class="fc-eoc-wrapper"
                     data-date="${flight.date || 'Unknown'}"
                     data-oiata="${flight.originIata || ''}"
                     data-diata="${flight.destinationIata || ''}"
                     data-ocountry="${flight.originCountry || ''}"
                     data-dcountry="${flight.destinationCountry || ''}">
                  <div style="background:#f8fafc;color:#475569;border:1px dashed #cbd5e1;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;">⏳ Checking EOC...</div>
                </div>`;

              const pr = flight.printedReference && flight.printedReference !== 'Not Provided' ? flight.printedReference : '';
              const pn = flight.pnr && flight.pnr !== 'Not Provided' && !flight.pnr.toLowerCase().includes('scan') ? flight.pnr : '';

              // Apply PNR color coding
              let colorClass = '';
              if (pn && pn !== 'Not Provided' && pn !== 'Unknown') {
                const pnrKey = pn.trim().toUpperCase();
                if (pnrColorMap[pnrKey]) {
                  colorClass = `pnr-badge-${pnrColorMap[pnrKey]}`;
                }
              }

              const editableSpan = `<span class="pnr-editable ${colorClass}" contenteditable="true" spellcheck="false" data-placeholder="Scan..." onfocus="const sel=window.getSelection(); const range=document.createRange(); range.selectNodeContents(this); sel.removeAllRanges(); sel.addRange(range);">${pn}</span>`;
              const pnrBadge = (pr === pn && pn !== '') || (pr === '' && pn !== '')
                ? `<div class="${colorClass}" style="display:inline-flex;align-items:flex-start;gap:6px;font-size:11px;background:#f8fafc;padding:4px 8px;border-radius:6px;border:1px solid #cbd5e1;color:#334155;font-weight:700;max-width:100%;"><span style="white-space:nowrap;margin-top:1px;">📱 PNR:</span> ${editableSpan}</div>`
                : `<div class="${colorClass}" style="display:inline-flex;align-items:flex-start;flex-wrap:wrap;gap:6px;font-size:11px;background:#f8fafc;padding:4px 8px;border-radius:6px;border:1px solid #cbd5e1;color:#334155;font-weight:700;max-width:100%;"><span style="color:#64748b;white-space:nowrap;margin-top:1px;">🖨️ Printed Ref: <span style="color:#475569;">${pr || 'N/A'}</span></span><span style="color:#cbd5e1;margin-top:1px;">|</span><span style="white-space:nowrap;margin-top:1px;">📱 True PNR:</span> ${editableSpan}</div>`;

              // 🎫 PER-LEG PASSENGER TICKETS RENDERING
              let passengerTicketsHtml = '';
              if (flight.passengerTickets && Array.isArray(flight.passengerTickets) && flight.passengerTickets.length > 0) {
                const ticketBadges = flight.passengerTickets.map(pt => {
                  const name = pt.passengerName || 'Unknown';
                  const ticket = pt.ticketNumber || 'N/A';
                  // Extract first name for compact display
                  const firstName = name.split(' ')[0];
                  return `<div style="display:inline-flex;align-items:center;gap:6px;background:#eff6ff;border:1px solid #bfdbfe;padding:6px 12px;border-radius:8px;font-family:'Courier New',Courier,monospace;font-size:12px;font-weight:700;color:#1e3a8a;white-space:nowrap;">
                    <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#2563eb;">👤 ${firstName}:</span>
                    <span style="letter-spacing:0.5px;">${ticket}</span>
                  </div>`;
                }).join('');

                const ticketCount = flight.passengerTickets.length;
                passengerTicketsHtml = `
                  <div class="fc-collapsible-section" data-section="tickets">
                    <button class="fc-collapse-trigger" type="button" data-toggle-section="tickets">
                      <span class="fc-collapse-icon">▶</span>
                      <span class="fc-collapse-label">🎫 Ticket Numbers Used (${ticketCount})</span>
                    </button>
                    <div class="fc-collapse-content">
                      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">
                        ${ticketBadges}
                      </div>
                    </div>
                  </div>
                `;
              }

              const partialAttr = isMissing ? '' : (flight.date || '');

              // BUG 4: Mark expired cards with a data attribute so we can add
              // the amber pulsing class after the HTML is in the DOM.
              const isExpiredCard = flight.ec261Leg?.claimExpiration?.isExpired === true;

              fcc.innerHTML += `
                <div class="flight-card" style="opacity:${opa};"
                     data-partial-date="${partialAttr}"
                     ${isExpiredCard ? 'data-initially-expired="true"' : ''}>
                  <div style="display:block;width:100%;">${swarn}</div>
                  <div class="fc-top"><div class="fc-airline">${airText}</div></div>
                  <div class="fc-path-container">
                    <div class="fc-node left">
                      <div class="fc-iata">${flight.originIata || '???'}</div>
                      <div class="fc-airport">${flight.originName || ''}</div>
                      <div class="fc-city">${flight.originCity || ''}, ${flight.originCountry || ''}</div>
                      ${originSt}
                    </div>
                    <div class="fc-line-wrapper">${distHtml}<div class="fc-line"></div><div class="fc-plane">✈</div></div>
                    <div class="fc-node right">
                      <div class="fc-iata">${flight.destinationIata || '???'}</div>
                      <div class="fc-airport">${flight.destinationName || ''}</div>
                      <div class="fc-city">${flight.destinationCity || ''}, ${flight.destinationCountry || ''}</div>
                      ${destSt}
                    </div>
                  </div>
                  <div class="fc-times-row">
                    <div><div class="fc-time">${depTimeDisplay}</div></div>
                    <div style="text-align:right;"><div class="fc-time">${arrTimeDisplay}</div></div>
                  </div>
                  <div class="fc-info-strip" style="flex-wrap:wrap;">
                    ${datePillHtml}
                    <span class="fc-strip-sep">·</span>
                    <span class="fc-flight-num" style="display:flex;align-items:center;flex-wrap:wrap;">✈ ${fnDisp} ${stBtns}</span>
                    <span class="fc-strip-sep" style="width:100%;height:1px;background:#e2e8f0;margin:4px 0;"></span>
                    ${pnrBadge}
                    ${passengerTicketsHtml}
                    ${docsHtml ? `<span class="fc-strip-sep" style="width:100%;height:1px;background:#e2e8f0;margin:4px 0;"></span>${docsHtml}` : ''}
                  </div>
                  <div class="fc-footer">
                    <div style="display:flex;gap:8px;align-items:center;">${eocHtml}</div>
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                      ${legBadge}
                      <div class="exp-badge-container" data-years="${expYears}" data-country="${expCountry}">${expBadge}</div>
                    </div>
                  </div>
                </div>`;
            });
          });
        } else {
          fcc.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);background:var(--surface);border-radius:var(--radius-md);border:1px dashed var(--border-soft);">No flight routes detected.</div>`;
        }

        jw.appendChild(fcc);
        resultsCard.appendChild(jw);
      });

      // BUG 4: Apply amber expired pulsing class to all initially-expired cards
      document.querySelectorAll('.flight-card[data-initially-expired="true"]').forEach(card => {
        card.classList.add('expired-alert-active');
      });

      // Year resolution — same logic as before
      if (hasMissingYear) {
        const preFilledYear = (document.getElementById('globalJourneyYear')?.value || '').trim();

        if (preFilledYear && /^\d{4}$/.test(preFilledYear)) {
          const autoPromises = [];
          document.querySelectorAll('.flight-card[data-partial-date]').forEach(card => {
            const partial = card.dataset.partialDate;
            if (!partial || partial === 'Unknown' || /\d{4}/.test(partial)) return;
            const full = buildFullDate(partial, preFilledYear);
            if (full) autoPromises.push(applyDateToCard(card, full));
          });
          await Promise.all(autoPromises);

          const stillPartial = [...document.querySelectorAll('.flight-card[data-partial-date]')]
            .filter(c => { const p = c.dataset.partialDate; return p && p !== 'Unknown' && !/\d{4}/.test(p); });
          if (stillPartial.length > 0) applyYearBtn.style.display = 'inline-flex';
        } else {
          applyYearBtn.style.display = 'inline-flex';
        }
      }

      // Fire EOC checks in parallel
      document.querySelectorAll('.fc-eoc-wrapper').forEach(w => {
        runEOCCheck(w, w.closest('.flight-card'));
      });

    } catch (err) {
      if (err.name !== 'AbortError') { alert(`Analysis Error: ${err.message}\n\nIf this persists, check the server console.`); console.error(err); }
    } finally {
      clearInterval(timerInterval);
      analyzeBtn.innerHTML = 'Analyze Document';
      analyzeBtn.disabled = false;
    }
  });

  // ---------------------------------------------------------------------------
  // DATE VALIDATOR for flight-status buttons
  // ---------------------------------------------------------------------------
  function validateDateForAPI(btn, card) {
    const dv = btn.dataset.date;
    if (!dv || dv === 'Unknown' || !/\d{4}/.test(dv)) {
      const o = { html: btn.innerHTML, bg: btn.style.background, col: btn.style.color, bdr: btn.style.border };
      btn.innerHTML = '⚠️ Date Incomplete'; btn.style.background = '#fef2f2'; btn.style.color = '#dc2626'; btn.style.border = '1px solid #fecaca';
      const pill = card.querySelector('.needs-date-warning');
      if (pill) { pill.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.4)'; setTimeout(() => { pill.style.boxShadow = ''; }, 2000); }
      setTimeout(() => { btn.innerHTML = o.html; btn.style.background = o.bg; btn.style.color = o.col; btn.style.border = o.bdr; btn.disabled = false; }, 2000);
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // EVENT DELEGATION
  // ---------------------------------------------------------------------------
  resultsCard.addEventListener('click', async (e) => {

    // Handle collapse/expand toggle
    const collapseBtn = e.target.closest('.fc-collapse-trigger');
    if (collapseBtn) {
      e.preventDefault();
      e.stopPropagation();

      const section = collapseBtn.closest('.fc-collapsible-section');
      const content = section.querySelector('.fc-collapse-content');

      if (collapseBtn.classList.contains('expanded')) {
        // Collapse
        collapseBtn.classList.remove('expanded');
        content.classList.remove('expanded');
        setTimeout(() => { content.style.display = 'none'; }, 400);
      } else {
        // Expand
        content.style.display = 'block';
        void content.offsetWidth; // Force reflow for animation
        collapseBtn.classList.add('expanded');
        content.classList.add('expanded');
      }
      return;
    }

    const editBtn = e.target.closest('.fc-date-edit-btn');
    if (editBtn) { const card = editBtn.closest('.flight-card'); showDateEditor(card, card.dataset.confirmedDate || ''); return; }

    const setBtn = e.target.closest('.fc-date-set-btn');
    if (setBtn) {
      const pw = setBtn.closest('.fc-date-pill-wrapper');
      const picker = pw?.querySelector('.fc-inline-date-picker');
      const card = setBtn.closest('.flight-card');
      if (!picker?.value) { alert('Please select a date first.'); return; }
      setBtn.disabled = true; setBtn.textContent = '⏳';
      await applyDateToCard(card, picker.value);
      return;
    }

    const statusBtn = e.target.closest('.btn-check-status');
    if (!statusBtn) return;
    const card = statusBtn.closest('.flight-card');
    if (!validateDateForAPI(statusBtn, card)) return;

    const flightNum = statusBtn.dataset.flight, date = statusBtn.dataset.date;
    const origin = statusBtn.dataset.origin, dest = statusBtn.dataset.dest;
    statusBtn.innerHTML = `⏳ ${flightNum} Thinking...`; statusBtn.disabled = true;

    try {
      const r = await fetch(`/api/flight-status?flightNumber=${encodeURIComponent(flightNum)}&date=${encodeURIComponent(date)}&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}`);
      const data = await r.json();

      if (data.aiStats) {
        const ai = data.aiStats, ic = ai.rawStatus === 'C', id = ai.rawStatus === 'D';
        const asc = ic ? `<div style="font-size:22px;font-weight:700;color:#475569;line-height:1;text-decoration:line-through;opacity:0.5;">${ai.arrSched}</div>` : `<div style="font-size:22px;font-weight:700;color:#f8fafc;line-height:1;">${ai.arrSched}</div>`;
        const aac = ic ? `<div style="font-size:13px;font-weight:700;color:#ef4444;margin-top:6px;">Flight did not operate</div>` : ai.arrTimeDataPending ? `<div style="font-size:16px;font-weight:700;color:#64748b;line-height:1;">Data Pending</div><div style="font-size:10px;color:#475569;margin-top:4px;">Cirium update expected shortly</div>` : `<div style="font-size:22px;font-weight:700;color:${ai.arrDelayColor};line-height:1;">${ai.arrActual}</div>`;
        const dvc = (id && ai.divertedTo) ? `<div style="margin-top:12px;background:#451a03;border:1px solid #854d0e;border-left:3px solid #f59e0b;border-radius:8px;padding:10px 14px;font-size:12px;font-weight:700;color:#fbbf24;text-align:right;">⚠️ Diverted to ${ai.divertedTo}${ai.divertedToCity ? ` — ${ai.divertedToCity}` : ''}</div>` : '';

        const sc = document.createElement('div');
        sc.style.cssText = 'margin-top:20px;border-radius:16px;overflow:hidden;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1),0 10px 10px -5px rgba(0,0,0,0.04);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;animation:fadeIn 0.4s ease;';
        sc.innerHTML = `
          <div style="background:${ai.bannerBg};color:${ai.bannerTextCol};text-align:center;padding:14px;font-size:15px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;">${ai.bannerText} (${flightNum})</div>
          <div style="background:#0f172a;color:#fff;padding:24px;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
              <div style="flex:1;min-width:0;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;display:flex;align-items:center;gap:6px;overflow:hidden;"><span style="flex-shrink:0;">✈️</span><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ai.operatorName}</span></div>
              <div style="flex-shrink:0;background:#1e293b;border:1px solid #334155;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:700;color:#94a3b8;display:flex;align-items:center;gap:6px;">⏱️ ${ai.flightDuration}</div>
              <div style="flex:1;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div style="text-align:left;flex:1;"><div style="font-size:56px;font-weight:800;line-height:1;letter-spacing:-2px;margin-bottom:8px;">${ai.depIata}</div><div style="font-size:15px;color:#94a3b8;font-weight:500;">${ai.depCity}</div></div>
              <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:0 10px;opacity:0.6;"><div style="height:2px;background:repeating-linear-gradient(to right,#cbd5e1 0,#cbd5e1 6px,transparent 6px,transparent 12px);width:100%;"></div><div style="font-size:28px;transform:rotate(90deg);margin-left:-14px;color:#cbd5e1;">✈</div></div>
              <div style="text-align:right;flex:1;"><div style="font-size:56px;font-weight:800;line-height:1;letter-spacing:-2px;margin-bottom:8px;">${ai.arrIata}</div><div style="font-size:15px;color:#94a3b8;font-weight:500;">${ai.arrCity}</div></div>
            </div>
            <div style="background:#1e293b;border-radius:16px;padding:20px;margin-top:32px;display:flex;justify-content:space-between;box-shadow:inset 0 2px 4px rgba(0,0,0,0.1);">
              <div style="flex:1;">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#64748b;margin-bottom:16px;font-weight:800;">Departure Gate</div>
                <div style="margin-bottom:16px;"><div style="font-size:13px;color:#94a3b8;margin-bottom:4px;display:flex;align-items:center;gap:6px;">Scheduled <span style="background:#334155;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;">${ai.depSchedZone}</span></div><div style="font-size:22px;font-weight:700;color:#f8fafc;line-height:1;">${ai.depSched}</div><div style="font-size:12px;color:#64748b;margin-top:4px;">${ai.depDate}</div></div>
                <div><div style="font-size:13px;color:#94a3b8;margin-bottom:4px;display:flex;align-items:center;gap:6px;">${ai.depActualLabel} <span style="background:#334155;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;">${ai.depActualZone}</span></div><div style="font-size:22px;font-weight:700;color:#f8fafc;line-height:1;">${ai.depActual}</div></div>
              </div>
              <div style="width:1px;background:#334155;margin:0 20px;"></div>
              <div style="flex:1;text-align:right;${ic ? 'opacity:0.45;' : ''}">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#64748b;margin-bottom:16px;font-weight:800;">Arrival Gate</div>
                <div style="margin-bottom:12px;"><div style="font-size:13px;color:#94a3b8;margin-bottom:4px;display:flex;align-items:center;justify-content:flex-end;gap:6px;"><span style="background:#334155;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;">${ai.arrSchedZone}</span> Scheduled</div>${asc}<div style="font-size:12px;color:#64748b;margin-top:4px;">${ai.arrDate}</div></div>
                <div><div style="font-size:13px;color:#94a3b8;margin-bottom:4px;display:flex;align-items:center;justify-content:flex-end;gap:6px;"><span style="background:#334155;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;">${ai.arrActualZone}</span> ${ai.arrActualLabel}</div>${aac}</div>
                ${dvc}
              </div>
            </div>
            <div style="margin-top:24px;text-align:center;border-top:1px dashed #334155;padding-top:20px;">
              <span style="font-size:13px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Flight Status:</span>
              <strong style="margin-left:10px;font-size:18px;color:${ai.arrDelayColor};background:${ai.arrDelayColor}15;border:1px solid ${ai.arrDelayColor}30;padding:6px 16px;border-radius:8px;">${ai.arrDelay}</strong>
            </div>
          </div>`;
        card.appendChild(sc);
        statusBtn.outerHTML = `<div style="background:#e2e8f0;color:#475569;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;margin-left:6px;display:inline-block;">✨ ${flightNum} checked</div>`;
      } else {
        statusBtn.outerHTML = `<div style="background:#fef2f2;color:#991b1b;padding:5px 10px;border-radius:6px;font-size:11px;font-weight:600;border:1px solid #fecaca;margin-left:6px;display:inline-block;max-width:280px;white-space:normal;line-height:1.4;vertical-align:middle;">⚠️ <b>${flightNum}:</b> ${data.error || 'Status unavailable'}</div>`;
      }
    } catch (err) {
      console.error(err);
      statusBtn.outerHTML = `<div style="background:#fef2f2;color:#991b1b;padding:5px 10px;border-radius:6px;font-size:11px;font-weight:600;border:1px solid #fecaca;margin-left:6px;display:inline-block;">❌ Network/Server Error</div>`;
    }
  });
});