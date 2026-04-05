/* =============================================================================
   ticket-analyzer.js
   =============================================================================
   New features vs. previous version:
   - If analysis finds legs with day+month but no year, a pulsing "Enter ✓"
     button appears next to the year input. Clicking it fills all year-missing
     cards, re-runs EOC checks and recalculates expiry badges client-side.
   - If a leg has NO date at all, an inline date-picker is shown on that card.
     Confirming a date triggers the same EOC + expiry update for that card only.
   - EOC checks now use a stable .fc-eoc-wrapper so they can be re-triggered
     without replacing the element reference.
   ============================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  const ticketDropZone = document.getElementById('ticketDropZone');
  const ticketInput    = document.getElementById('ticketInput');
  const previewTicket  = document.getElementById('previewTicketContainer');
  const ticketName     = document.getElementById('ticketNameDisplay');
  const analyzeBtn     = document.getElementById('analyzeBtn');
  const clearBtn       = document.getElementById('clearFilesBtn');
  const resultsCard    = document.getElementById('resultsCard');

  // ---------------------------------------------------------------------------
  // INJECT STYLES
  // ---------------------------------------------------------------------------
  const styleEl = document.createElement('style');
  styleEl.innerHTML = `
    @keyframes pulsyGlassyRed {
      0%   { box-shadow: 0 0 0 0 rgba(220,38,38,0.5), inset 0 0 10px rgba(220,38,38,0.1);
              background-color: rgba(254,242,242,0.4); border-color: rgba(239,68,68,0.5); }
      100% { box-shadow: 0 0 20px 8px rgba(220,38,38,0), inset 0 0 30px rgba(220,38,38,0.2);
              background-color: rgba(254,242,242,0.85); border-color: rgba(220,38,38,1); }
    }
    .flight-card.eoc-alert-active {
      animation: pulsyGlassyRed 1.5s infinite alternate ease-in-out !important;
      border-width: 2px !important;
      backdrop-filter: blur(8px) !important;
      transition: all 0.3s ease;
    }

    /* Pulsing ring on the "Enter ✓" year button */
    @keyframes yearBtnPulse {
      0%   { box-shadow: 0 0 0 0 rgba(37,99,235,0.7); }
      65%  { box-shadow: 0 0 0 12px rgba(37,99,235,0); }
      100% { box-shadow: 0 0 0 0 rgba(37,99,235,0); }
    }
    #applyYearBtn { animation: yearBtnPulse 1.6s infinite; }
    #applyYearBtn:disabled { animation: none; opacity: 0.7; }

    /* Subtle pulse on inline set-date button */
    @keyframes setDatePulse {
      0%   { box-shadow: 0 0 0 0 rgba(37,99,235,0.5); }
      65%  { box-shadow: 0 0 0 8px rgba(37,99,235,0); }
      100% { box-shadow: 0 0 0 0 rgba(37,99,235,0); }
    }
    .fc-date-set-btn { animation: setDatePulse 2s infinite; }
    .fc-date-set-btn:disabled { animation: none; }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(styleEl);

  // ---------------------------------------------------------------------------
  // INJECT YEAR INPUT + "Enter" BUTTON
  // ---------------------------------------------------------------------------
  const yearInputHtml = `
    <div id="yearInputWrapper" style="margin-bottom:20px;background:#fffbeb;border:1px solid #fcd34d;padding:15px;border-radius:8px;">
      <label style="display:block;font-weight:800;color:#b45309;margin-bottom:6px;font-size:14px;">
        📅 Confirm Flight Year (Highly Recommended)
      </label>
      <div style="font-size:12px;color:#92400e;margin-bottom:12px;line-height:1.4;">
        Boarding passes often hide the year. Enter the year of travel (e.g., 2024) before
        analyzing to guarantee the AI calculates perfect Jurisdiction &amp; Expiration limits.
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
    </div>`;
  if (ticketDropZone) ticketDropZone.insertAdjacentHTML('beforebegin', yearInputHtml);

  // ---------------------------------------------------------------------------
  // FILE HANDLING
  // ---------------------------------------------------------------------------
  let currentFiles = [];
  let fetchAbortController = null;

  function updateUI() {
    if (currentFiles.length === 0) {
      previewTicket.style.display = 'none';
      resultsCard.style.display   = 'none';
      return;
    }
    ticketName.innerText = currentFiles.length === 1
      ? `📄 1 File Ready: ${currentFiles[0].name}`
      : `📄 ${currentFiles.length} Files Ready`;
    previewTicket.style.display = 'block';
  }

  function handleFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    currentFiles = [...currentFiles, ...Array.from(fileList)];
    updateUI();
  }

  clearBtn.addEventListener('click', () => {
    currentFiles = [];
    ticketInput.value = '';
    if (fetchAbortController) fetchAbortController.abort();
    updateUI();
  });

  ticketDropZone.addEventListener('click', () => ticketInput.click());
  ticketInput.addEventListener('change', (e) => handleFiles(e.target.files));
  ticketDropZone.addEventListener('dragover', (e) => { e.preventDefault(); ticketDropZone.classList.add('dragover'); });
  ticketDropZone.addEventListener('dragleave', (e) => { e.preventDefault(); ticketDropZone.classList.remove('dragover'); });
  ticketDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    ticketDropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  });

  document.addEventListener('paste', (e) => {
    const clipboard = e.clipboardData || window.clipboardData;
    if (!clipboard.items) return;
    const pastedFiles = [];
    for (const item of clipboard.items) {
      if (item.type.startsWith('image/') || item.type === 'application/pdf') {
        const file = item.getAsFile();
        const ext  = file.type.split('/')[1] || 'png';
        pastedFiles.push(new File([file], `Pasted_Document_${Date.now()}.${ext}`, { type: file.type }));
      }
    }
    if (pastedFiles.length > 0) { currentFiles = [...currentFiles, ...pastedFiles]; updateUI(); }
  });

  // ---------------------------------------------------------------------------
  // DATE / YEAR HELPERS
  // ---------------------------------------------------------------------------

  /** Try to parse a partial "DD Mon" or "Mon DD" string + a year into YYYY-MM-DD */
  function buildFullDate(partialDate, year) {
    if (!partialDate || !year) return null;
    const y = String(year).trim();
    if (!/^\d{4}$/.test(y)) return null;

    const months = {
      jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
      jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12',
      january:'01', february:'02', march:'03', april:'04', june:'06',
      july:'07', august:'08', september:'09', october:'10', november:'11', december:'12',
    };

    // "25 Mar" / "25 March"
    const m1 = partialDate.trim().match(/^(\d{1,2})\s+([A-Za-z]+)$/);
    if (m1) {
      const day = m1[1].padStart(2, '0');
      const mon = months[m1[2].toLowerCase()];
      if (mon) return `${y}-${mon}-${day}`;
    }

    // "Mar 25" / "March 25"
    const m2 = partialDate.trim().match(/^([A-Za-z]+)\s+(\d{1,2})$/);
    if (m2) {
      const mon = months[m2[1].toLowerCase()];
      const day = m2[2].padStart(2, '0');
      if (mon) return `${y}-${mon}-${day}`;
    }

    // Last resort: native parser
    const parsed = new Date(`${partialDate} ${y}`);
    if (!isNaN(parsed.getTime())) {
      const mm = String(parsed.getMonth() + 1).padStart(2, '0');
      const dd = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${mm}-${dd}`;
    }

    return null;
  }

  /** Recalculate and re-render the expiry badge from stored data-years / data-country */
  function updateExpirationBadge(container, fullDate) {
    const rawYears   = container.dataset.years;
    const bestCountry = container.dataset.country;

    if (!rawYears || rawYears === 'N/A' || rawYears === 'undefined') {
      container.innerHTML = `<div class="fc-exp-badge">⚠️ Jurisdiction limit unknown</div>`;
      return;
    }

    const years = parseInt(rawYears, 10);
    if (isNaN(years)) {
      // Special strings like "No Limit", "2 Months - 10"
      container.innerHTML = `<div class="fc-exp-badge" title="${bestCountry}">⏳ ${rawYears}</div>`;
      return;
    }

    const flightDate = new Date(fullDate);
    if (isNaN(flightDate.getTime())) {
      container.innerHTML = `<div class="fc-exp-badge">⚠️ Cannot calculate expiry</div>`;
      return;
    }

    const expDate    = new Date(flightDate);
    expDate.setFullYear(expDate.getFullYear() + years);
    const expDateStr = expDate.toISOString().split('T')[0];
    const isExpired  = new Date() > expDate;

    container.innerHTML = isExpired
      ? `<div class="fc-exp-badge expired" title="Deadline was ${expDateStr} (${bestCountry})">🚨 EXPIRED</div>`
      : `<div class="fc-exp-badge" title="Valid under ${bestCountry} law (${years} years)">⏳ Valid to ${expDateStr}</div>`;
  }

  /** Fetch EOC data for a wrapper div and update it + the parent flight card */
  async function runEOCCheck(eocWrapper, flightCard) {
    const { date, oiata, diata, ocountry, dcountry } = eocWrapper.dataset;

    // Reset previous EOC state on the card
    flightCard.classList.remove('eoc-alert-active');
    flightCard.querySelectorAll('.eoc-flight-alert').forEach(el => el.remove());

    if (!date || date === 'Unknown' || !/\d{4}/.test(date)) {
      eocWrapper.innerHTML = `<div style="background:#fef2f2;color:#dc2626;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid #fecaca;">⚠️ Date Incomplete — No EOC Check</div>`;
      return;
    }

    eocWrapper.innerHTML = `<div style="background:#f8fafc;color:#475569;border:1px dashed #cbd5e1;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;">⏳ Checking EOC...</div>`;

    try {
      const res  = await fetch(`/api/check-eoc?date=${encodeURIComponent(date)}&originIata=${encodeURIComponent(oiata)}&destIata=${encodeURIComponent(diata)}&originCountry=${encodeURIComponent(ocountry)}&destCountry=${encodeURIComponent(dcountry)}`);
      const data = await res.json();

      if (data.eocFound && data.events && data.events.length > 0) {
        flightCard.classList.add('eoc-alert-active');

        const badgeText  = data.events.length > 1 ? `${data.events.length} EOCs Found` : `EOC Found`;
        const headerText = data.events.length > 1
          ? `⚠️ MULTIPLE EXTRAORDINARY CIRCUMSTANCES DETECTED (${data.events.length})`
          : `⚠️ EXTRAORDINARY CIRCUMSTANCE DETECTED`;

        eocWrapper.innerHTML = `<div style="background:#fef2f2;color:#991b1b;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid #fecaca;" title="Claim may be invalidated by EOC">🚨 ${badgeText}</div>`;

        const eventsHtml = data.events.map((ev, i) => `
          <div style="${i > 0 ? 'margin-top:12px;padding-top:12px;border-top:1px dashed #fca5a5;' : ''}
                      color:#450a0a;display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;align-items:baseline;">
            <strong style="color:#991b1b;">Category:</strong> <span>${ev.category}</span>
            <strong style="color:#991b1b;">Event:</strong>    <span>${ev.event}</span>
            <strong style="color:#991b1b;">Location:</strong> <span>${ev.location}</span>
            <strong style="color:#991b1b;">Decision:</strong> <span style="font-weight:800;color:#dc2626;">${ev.decision}</span>
          </div>`).join('');

        const eocAlert = document.createElement('div');
        eocAlert.className  = 'eoc-flight-alert';
        eocAlert.style.cssText = 'margin-top:16px;background:#fef2f2;border:1px solid #fecaca;border-left:4px solid #ef4444;padding:16px;border-radius:8px;font-size:13px;color:#7f1d1d;line-height:1.6;animation:fadeIn 0.4s ease;box-shadow:0 4px 6px -1px rgba(239,68,68,0.1);';
        eocAlert.innerHTML = `
          <div style="font-weight:800;color:#dc2626;margin-bottom:12px;text-transform:uppercase;font-size:12px;letter-spacing:0.5px;">
            ${headerText}
          </div>
          ${eventsHtml}`;
        flightCard.appendChild(eocAlert);
      } else {
        eocWrapper.innerHTML = `<div style="background:#dcfce7;color:#166534;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid #bbf7d0;">✅ No EOC Found</div>`;
      }
    } catch (err) {
      console.error('EOC Check Error:', err);
      eocWrapper.innerHTML = `<div style="background:#fef2f2;color:#991b1b;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid #fecaca;">❌ EOC Check Failed</div>`;
    }
  }

  /**
   * Apply a confirmed full date (YYYY-MM-DD) to a flight card:
   *   1. Updates the date pill display
   *   2. Re-runs EOC check with the new date
   *   3. Recalculates the expiry badge client-side
   *   4. Updates data-date on any flight-status buttons so they can be checked
   */
  async function applyDateToCard(flightCard, fullDate) {
    // 1. Date pill
    const datePillWrapper = flightCard.querySelector('.fc-date-pill-wrapper');
    if (datePillWrapper) {
      datePillWrapper.style.cssText = 'display:inline-flex;';
      datePillWrapper.innerHTML = `<span class="fc-date-pill" style="background:#dcfce7;color:#166534;border:1px solid #bbf7d0;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;">📅 ${fullDate}</span>`;
    }

    // 2. EOC
    const eocWrapper = flightCard.querySelector('.fc-eoc-wrapper');
    if (eocWrapper) {
      eocWrapper.dataset.date = fullDate;
      await runEOCCheck(eocWrapper, flightCard);
    }

    // 3. Expiry badge
    const expContainer = flightCard.querySelector('.exp-badge-container');
    if (expContainer) updateExpirationBadge(expContainer, fullDate);

    // 4. Flight-status buttons — update their date so Cirium can be queried correctly
    flightCard.querySelectorAll('.btn-check-status').forEach(btn => {
      btn.dataset.date = fullDate;
    });
  }

  // ---------------------------------------------------------------------------
  // "ENTER ✓" YEAR BUTTON
  // ---------------------------------------------------------------------------
  document.getElementById('applyYearBtn').addEventListener('click', async function () {
    const year = (document.getElementById('globalJourneyYear').value || '').trim();
    if (!year || !/^\d{4}$/.test(year)) {
      alert('Please enter a valid 4-digit year (e.g. 2024)');
      return;
    }

    this.disabled     = true;
    this.textContent  = '⏳ Updating...';

    const cards    = document.querySelectorAll('.flight-card[data-partial-date]');
    const promises = [];

    cards.forEach(card => {
      const partial = card.dataset.partialDate;
      // Skip: no partial date, already blank (handled by inline picker), or already has 4-digit year
      if (!partial || partial === 'Unknown' || /\d{4}/.test(partial)) return;

      const fullDate = buildFullDate(partial, year);
      if (fullDate) promises.push(applyDateToCard(card, fullDate));
    });

    await Promise.all(promises);

    // Check if any cards still need a year (safety)
    const remaining = [...document.querySelectorAll('.flight-card[data-partial-date]')]
      .filter(c => { const p = c.dataset.partialDate; return p && p !== 'Unknown' && !/\d{4}/.test(p); });

    this.style.display  = remaining.length > 0 ? 'inline-flex' : 'none';
    this.disabled       = false;
    this.textContent    = remaining.length > 0 ? 'Enter ✓' : 'Enter ✓';
  });

  // ---------------------------------------------------------------------------
  // MAIN ANALYSIS
  // ---------------------------------------------------------------------------
  analyzeBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (currentFiles.length === 0) return alert('Please upload a ticket or boarding pass first.');

    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = '<div class="modern-spinner" style="width:20px;height:20px;border-width:2px;margin:0 auto;"></div>';
    resultsCard.style.display = 'none';

    // Reset Enter button for new analysis
    const applyYearBtn = document.getElementById('applyYearBtn');
    applyYearBtn.style.display = 'none';
    applyYearBtn.disabled      = false;
    applyYearBtn.textContent   = 'Enter ✓';

    const startTime   = Date.now();
    const liveTimerEl = document.getElementById('liveTimer');
    const timerInterval = setInterval(() => {
      if (liveTimerEl) liveTimerEl.innerText = `${((Date.now() - startTime) / 1000).toFixed(1)}s`;
    }, 100);

    if (fetchAbortController) fetchAbortController.abort();
    fetchAbortController = new AbortController();

    const formData = new FormData();
    currentFiles.forEach(file => formData.append('ticket', file));
    const globalYear = document.getElementById('globalJourneyYear')?.value;
    if (globalYear) formData.append('journeyYear', globalYear);

    try {
      const res = await fetch('/api/analyze-ticket', {
        method: 'POST', body: formData, signal: fetchAbortController.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Server responded with status: ${res.status}`);
      }

      const rawResponse = await res.json();
      resultsCard.innerHTML   = '';
      resultsCard.style.display = 'block';

      // ---- No flight data ----
      if (rawResponse.noFlightData) {
        resultsCard.innerHTML = `
          <div style="text-align:center;padding:48px 24px;background:#fff7ed;border:1px dashed #fed7aa;border-radius:12px;color:#9a3412;">
            <div style="font-size:48px;margin-bottom:16px;">🚫✈️</div>
            <div style="font-size:18px;font-weight:700;margin-bottom:8px;">No Flight Information Found</div>
            <div style="font-size:14px;color:#c2410c;">This document doesn't contain any flight information.<br>Please upload a boarding pass, e-ticket, or itinerary.</div>
          </div>`;
        return;
      }

      let dataArray = rawResponse.journeys || rawResponse;
      if (!Array.isArray(dataArray)) dataArray = [dataArray];

if (rawResponse.processingTime) {
        resultsCard.innerHTML += `
          <div style="display:flex;justify-content:flex-end;align-items:center;margin-bottom:15px;gap:10px;flex-wrap:wrap;">
            <span style="background:#e2e8f0;color:#475569;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:700;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
              ⏱️ Processed in ${rawResponse.processingTime}s
            </span>
            ${rawResponse.costUSD ? `
            <span style="background:#dcfce7;color:#166534;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:800;border:1px solid #bbf7d0;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
              💸 ${rawResponse.costUSD}
            </span>
            <span style="background:#fef3c7;color:#b45309;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:800;border:1px solid #fde68a;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
              🌍 ${rawResponse.costEGP} EGP
            </span>` : ''}
          </div>`;
      }

      // ---- Pre-scan for banners ----
      let hasMissingLegPnr = false;
      let hasMissingYear   = false;

      dataArray.forEach(journey => {
        (journey.routes || []).forEach(route => {
          (route.legs || []).forEach(leg => {
            if (!leg.pnr || leg.pnr === 'Not Provided' || leg.pnr.toLowerCase().includes('scan') || leg.pnr === 'Unknown') hasMissingLegPnr = true;
            const noDate     = !leg.date || leg.date === 'Unknown' || leg.date.trim() === '';
            const noYear     = !noDate && !/\d{4}/.test(leg.date);
            if (noYear) hasMissingYear = true;
          });
        });
      });

      if (hasMissingLegPnr) {
        resultsCard.innerHTML += `
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-left:4px solid #3b82f6;padding:14px 18px;border-radius:8px;margin-bottom:24px;box-shadow:0 2px 4px rgba(0,0,0,0.02);">
            <div style="display:flex;align-items:center;gap:8px;font-weight:800;color:#1e3a8a;margin-bottom:6px;font-size:14px;"><span>📱</span> Missing PNRs Detected</div>
            <div style="color:#1e40af;font-size:13px;line-height:1.5;">One or more True PNRs could not be clearly extracted. <b>Please use your scanner to read the barcode on the specific flight's boarding pass, and edit the PNR field below.</b></div>
          </div>`;
      }

      // ---- Render journeys ----
      dataArray.forEach((data, journeyIndex) => {
        const journeyWrapper = document.createElement('div');
        journeyWrapper.style.marginBottom  = '60px';
        journeyWrapper.style.borderBottom  = journeyIndex < dataArray.length - 1 ? '3px dashed var(--border-soft)' : 'none';
        journeyWrapper.style.paddingBottom = journeyIndex < dataArray.length - 1 ? '40px' : '0';

        if (dataArray.length > 1) {
          journeyWrapper.innerHTML += `<h3 style="color:var(--primary);border-bottom:1px solid var(--border-soft);padding-bottom:10px;">🎫 Ticket / Journey ${journeyIndex + 1}</h3>`;
        }

        // EC261 summary card
        if (data.ec261 || (data.routes && data.routes.length > 0)) {
          let eligibleLegs = [], ineligibleLegs = [];
          (data.routes || []).forEach(route => {
            (route.legs || []).forEach(leg => {
              if (leg.ec261Leg?.status) {
                const ok      = !leg.ec261Leg.status.toLowerCase().includes('not');
                const summary = `<b>${leg.originIata || '?'} ➔ ${leg.destinationIata || '?'}</b>: ${leg.ec261Leg.reason}`;
                (ok ? eligibleLegs : ineligibleLegs).push(summary);
              }
            });
          });

          let cardClass, icon, titleHtml, reasonHtml, inlineStyle = '';
          if (eligibleLegs.length > 0 && ineligibleLegs.length > 0) {
            cardClass  = 'partially-eligible';
            inlineStyle = 'background-color:#fffbeb;border:1px solid #fde68a;';
            icon       = '<span style="color:#d97706;">⚠️</span>';
            titleHtml  = '<h4 class="ec-title" style="color:#b45309;">OVERALL CLAIM: MIXED ELIGIBILITY</h4>';
            reasonHtml = `
              <p class="ec-reason" style="margin-bottom:8px;color:#92400e;">This journey contains a mix of eligible and legally ineligible flight legs.</p>
              <div style="display:flex;flex-direction:column;gap:8px;background:rgba(255,255,255,0.6);padding:12px;border-radius:8px;border:1px dashed #fcd34d;">
                <div style="color:#15803d;font-size:13px;line-height:1.4;">✅ ${eligibleLegs.join('<br>✅ ')}</div>
                <div style="color:#b91c1c;font-size:13px;line-height:1.4;margin-top:4px;padding-top:8px;border-top:1px dashed #fde68a;">❌ ${ineligibleLegs.join('<br>❌ ')}</div>
              </div>`;
          } else {
            let isEligible = false;
            let aiStatus   = data.ec261 ? data.ec261.status.toUpperCase() : 'UNKNOWN';
            let aiReason   = data.ec261 ? data.ec261.reason : '';
            if (eligibleLegs.length > 0)   { isEligible = true;  aiStatus = 'ELIGIBLE'; }
            else if (ineligibleLegs.length > 0) { isEligible = false; aiStatus = 'NOT ELIGIBLE'; }
            else if (data.ec261)            { isEligible = !data.ec261.status.toLowerCase().includes('not'); }
            cardClass  = isEligible ? 'eligible' : 'not-eligible';
            icon       = isEligible ? '🛡️' : '🚫';
            titleHtml  = `<h4 class="ec-title">OVERALL CLAIM: ${aiStatus}</h4>`;
            reasonHtml = `<p class="ec-reason">${aiReason}</p>`;
          }
          journeyWrapper.innerHTML += `
            <div class="ec261-card ${cardClass}" style="${inlineStyle}">
              <div class="ec-icon">${icon}</div>
              <div class="ec-content">${titleHtml}${reasonHtml}</div>
            </div>`;
        }

        // Passenger card (deduplicated across journeys)
        let showPassengerCard = true;
        if (journeyIndex > 0) {
          const cur  = (data.passengers || []).map(p => p.firstName + p.lastName + p.ticketNumber).join('|');
          const prev = (dataArray[journeyIndex - 1].passengers || []).map(p => p.firstName + p.lastName + p.ticketNumber).join('|');
          if (cur === prev && cur !== '') showPassengerCard = false;
        }
        if (showPassengerCard) {
          const pHtml = (data.passengers || []).length > 0
            ? (data.passengers || []).map(p => `
                <div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;padding:10px 14px;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:8px;">
                  <span style="font-weight:700;color:var(--text-main);font-size:15px;">${p.firstName || ''} ${p.lastName || ''}</span>
                  <span style="font-family:monospace;color:var(--primary);font-weight:600;background:#e0f2fe;padding:4px 8px;border-radius:6px;font-size:13px;letter-spacing:1px;">🎟️ ${p.ticketNumber || 'No Ticket #'}</span>
                </div>`).join('')
            : `<div style="color:var(--text-muted);font-size:14px;">No passenger data extracted.</div>`;
          journeyWrapper.innerHTML += `
            <div class="passenger-card" style="display:flex;flex-direction:column;gap:16px;padding:20px;">
              <div style="font-size:11px;font-weight:800;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;">Passenger Roster & Tickets</div>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;width:100%;">${pHtml}</div>
            </div>`;
        }

        // ---- Flight cards ----
        const flightCardsContainer = document.createElement('div');

        if (data.routes && data.routes.length > 0) {
          data.routes.forEach(route => {
            flightCardsContainer.innerHTML += `<div class="route-header">${route.type || 'Flight Route'}</div>`;

            if (route.legs && route.legs.length > 0) {
              route.legs.forEach((flight, index) => {
                const legIndicator = route.legs.length > 1 ? `Leg ${index + 1}` : 'Direct';
                const isMissingDate = !flight.date || flight.date === 'Unknown' || flight.date.trim() === '';
                const isMissingYear = !isMissingDate && !/\d{4}/.test(flight.date);

                // -- EC261 badges --
                let legBadgeHtml = '';
                if (flight.ec261Leg?.status) {
                  const ok = !flight.ec261Leg.status.toLowerCase().includes('not');
                  legBadgeHtml = `<div class="fc-ec-badge ${ok ? 'eligible' : 'not-eligible'}" title="${flight.ec261Leg.reason}">${ok ? '✅' : '❌'} ${flight.ec261Leg.status}</div>`;
                  if (ok && flight.ec261Leg.estimatedClaimValue && flight.ec261Leg.estimatedClaimValue !== 'N/A') {
                    legBadgeHtml += `<div class="leg-claim-value">💸 ${flight.ec261Leg.estimatedClaimValue}</div>`;
                  }
                }

                // -- Expiry badge --
                let expBadgeHtml = '';
                let expBestYears = 'N/A', expBestCountry = 'N/A';
                let originStatute = '', destStatute = '';

                if (flight.ec261Leg?.claimExpiration) {
                  const exp = flight.ec261Leg.claimExpiration;
                  expBestYears   = exp.bestYears;
                  expBestCountry = exp.bestCountry;

                  const fmt = (v) => (!v || v === 'N/A' || String(v).toLowerCase().includes('not applicable'))
                    ? 'N/A' : (String(v).toLowerCase().includes('year') ? v : `${v} years`);

                  if (exp.originYears)      originStatute = `<div style="font-size:11px;color:#d97706;font-weight:700;margin-top:6px;letter-spacing:0.3px;">⚖️ Limit: ${fmt(exp.originYears)}</div>`;
                  if (exp.destinationYears) destStatute   = `<div style="font-size:11px;color:#d97706;font-weight:700;margin-top:6px;text-align:right;letter-spacing:0.3px;">⚖️ Limit: ${fmt(exp.destinationYears)}</div>`;

                  if (isMissingDate) {
                    expBadgeHtml = `<div class="fc-exp-badge" style="background:#fef08a;color:#9a3412;border:1px dashed #fde047;">⚠️ Set date to verify expiry</div>`;
                  } else if (isMissingYear) {
                    expBadgeHtml = `<div class="fc-exp-badge" style="background:#fef08a;color:#9a3412;border:1px dashed #fde047;">⚠️ Enter year to verify expiry</div>`;
                  } else if (exp.isExpired) {
                    expBadgeHtml = `<div class="fc-exp-badge expired" title="Deadline was ${exp.expirationDate} (${exp.bestCountry})">🚨 EXPIRED</div>`;
                  } else {
                    expBadgeHtml = `<div class="fc-exp-badge" title="Valid under ${exp.bestCountry} law (${exp.bestYears} years)">⏳ Valid to ${exp.expirationDate}</div>`;
                  }
                }

                // -- Airline label --
                const marketing = flight.marketingAirline || 'Unknown';
                const operating = flight.operatingAirline || marketing;
                const airText   = marketing === operating
                  ? `✈️ Operated by: ${operating}`
                  : `✈️ Booked: ${marketing} <span style="color:var(--primary);margin-left:8px;">| Operated by: ${operating}</span>`;

                // -- Status warnings --
                let statusWarningHtml = '', opacityStyle = '1';
                if (flight.flightStatus) {
                  const sl = flight.flightStatus.toLowerCase();
                  if (sl.includes('cancel')) {
                    statusWarningHtml += `<div style="background:#fee2e2;color:#dc2626;padding:6px 12px;border-radius:6px;font-weight:800;font-size:12px;margin-bottom:16px;margin-right:8px;display:inline-block;border:1px solid #fecaca;">⚠️ FLIGHT CANCELLED</div>`;
                    opacityStyle = '0.55';
                  }
                  if (sl.includes('review') || sl.includes('change') || sl.includes('rebook')) {
                    statusWarningHtml += `<div style="background:#ffedd5;color:#c2410c;padding:6px 12px;border-radius:6px;font-weight:800;font-size:12px;margin-bottom:16px;margin-right:8px;display:inline-block;border:1px solid #fed7aa;">🔄 SCHEDULE CHANGE / REVIEW TIMELINE</div>`;
                  }
                  if (sl.includes('replacement')) {
                    statusWarningHtml += `<div style="background:#e0e7ff;color:#3730a3;padding:6px 12px;border-radius:6px;font-weight:800;font-size:12px;margin-bottom:16px;margin-right:8px;display:inline-block;border:1px solid #c7d2fe;">🔄 REPLACEMENT FLIGHT</div>`;
                  }
                  if (sl.includes('missed') || sl.includes('unused')) {
                    statusWarningHtml += `<div style="background:#f1f5f9;color:#475569;padding:6px 12px;border-radius:6px;font-weight:800;font-size:12px;margin-bottom:16px;margin-right:8px;display:inline-block;border:1px dashed #cbd5e1;">🚶 MISSED CONNECTION / UNUSED TICKET</div>`;
                    opacityStyle = '0.65';
                  }
                }

                // -- Distance --
                const distanceHtml = flight.distanceKm
                  ? `<div style="position:absolute;top:-20px;font-size:10px;font-weight:700;color:var(--text-muted);background:var(--surface);padding:2px 8px;border-radius:10px;border:1px solid var(--border-soft);z-index:3;letter-spacing:0.5px;">${flight.distanceKm}</div>`
                  : '';

                // -- Claim documents --
                let docsHtml = '';
                if (flight.claimDocuments?.length) {
                  const items = flight.claimDocuments.map(doc => {
                    const isDefault    = doc.reqs === 'No documents required';
                    const docColor     = isDefault ? 'var(--text-muted)' : '#0369a1';
                    const docBg        = isDefault ? 'transparent' : '#f0f9ff';
                    const docBorder    = isDefault ? '1px dashed #cbd5e1' : '1px solid #bae6fd';
                    const rolePrefix   = doc.role ? `[${doc.role}] ` : '';
                    let jBadge = '';
                    if (doc.hq && doc.limit) {
                      const bc = doc.limit === 'N/A' ? '#94a3b8' : '#d97706';
                      const bb = doc.limit === 'N/A' ? '#f1f5f9' : '#fffbeb';
                      const be = doc.limit === 'N/A' ? '#e2e8f0' : '#fde68a';
                      jBadge = `<span style="background:${bb};color:${bc};padding:2px 6px;border-radius:4px;font-size:9px;margin-left:6px;font-weight:800;border:1px solid ${be};white-space:nowrap;vertical-align:middle;">🏛️ ${doc.hq} (${doc.limit})</span>`;
                    }
                    const label = isDefault
                      ? `<span style="display:inline-flex;align-items:center;flex-wrap:wrap;gap:2px;"><b>${rolePrefix}${doc.airline}</b>${jBadge} <span style="margin-left:2px;">: No docs required</span></span>`
                      : `<span style="display:inline-flex;align-items:center;flex-wrap:wrap;gap:2px;"><b>${rolePrefix}${doc.airline}</b>${jBadge} <span style="margin-left:2px;">Required: ${doc.reqs}</span></span>`;
                    return `<div style="display:flex;align-items:flex-start;gap:6px;color:${docColor};background:${docBg};border:${docBorder};padding:6px 10px;border-radius:6px;font-size:11px;margin-top:4px;width:100%;"><span style="flex-shrink:0;margin-top:2px;">${isDefault ? '📄' : '📑'}</span> <span style="white-space:normal;line-height:1.6;">${label}</span></div>`;
                  }).join('');
                  docsHtml = `<div style="width:100%;display:flex;flex-direction:column;margin-top:8px;">${items}</div>`;
                }

                // -- Flight number + status buttons --
                let statusBtnsHtml = '', flightNumsDisplay = '';
                const fNums = Array.isArray(flight.flightNumbers) ? flight.flightNumbers : [];
                if (fNums.length > 0) {
                  flightNumsDisplay = fNums.join(' <span style="color:#cbd5e1;font-weight:400;margin:0 4px;">/</span> ');
                  fNums.forEach(fn => {
                    const cleanNum = fn.trim();
                    if (cleanNum && cleanNum !== 'N/A' && cleanNum !== 'Unknown') {
                      statusBtnsHtml += `<button type="button" class="btn-check-status"
                        data-flight="${cleanNum}" data-date="${flight.date || 'Unknown'}"
                        data-origin="${flight.originIata || ''}" data-dest="${flight.destinationIata || ''}"
                        style="margin-left:6px;background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1;border-radius:6px;padding:3px 9px;font-size:11px;font-weight:700;cursor:pointer;transition:0.2s;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;">
                        📡 ${cleanNum} Stats</button>`;
                    }
                  });
                } else { flightNumsDisplay = 'N/A'; }

                // -----------------------------------------------------------------
                // DATE PILL — three variants
                // -----------------------------------------------------------------
                let datePillHtml = '';

                if (isMissingDate) {
                  // No date at all → inline date picker
                  datePillHtml = `
                    <div class="fc-date-pill-wrapper" style="display:inline-flex;align-items:center;gap:6px;background:#fef2f2;border:1px dashed #fecaca;padding:4px 10px;border-radius:8px;">
                      <span style="font-size:12px;color:#dc2626;font-weight:700;white-space:nowrap;">📅 No Date —</span>
                      <input type="date" class="fc-inline-date-picker"
                        style="border:none;background:transparent;font-size:12px;color:#0f172a;outline:none;cursor:pointer;font-weight:600;max-width:130px;">
                      <button class="fc-date-set-btn" type="button"
                        style="background:#2563eb;color:white;border:none;border-radius:4px;padding:3px 8px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">
                        ✓ Set
                      </button>
                    </div>`;
                } else if (isMissingYear) {
                  // Has day+month but no year → yellow warning (Enter button handles this globally)
                  datePillHtml = `
                    <div class="fc-date-pill-wrapper" style="display:inline-flex;">
                      <span class="fc-date-pill needs-date-warning"
                        style="background:#fef08a;color:#9a3412;border:1px dashed #fde047;transition:0.3s;">
                        📅 ${flight.date}
                      </span>
                    </div>`;
                } else {
                  // Full date — normal pill
                  datePillHtml = `
                    <div class="fc-date-pill-wrapper" style="display:inline-flex;">
                      <span class="fc-date-pill">📅 ${flight.date}</span>
                    </div>`;
                }

                // -----------------------------------------------------------------
                // EOC WRAPPER — stable container for re-triggering
                // -----------------------------------------------------------------
                const eocWrapperHtml = `
                  <div class="fc-eoc-wrapper"
                       data-date="${flight.date || 'Unknown'}"
                       data-oiata="${flight.originIata || ''}"
                       data-diata="${flight.destinationIata || ''}"
                       data-ocountry="${flight.originCountry || ''}"
                       data-dcountry="${flight.destinationCountry || ''}">
                    <div style="background:#f8fafc;color:#475569;border:1px dashed #cbd5e1;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;">
                      ⏳ Checking EOC...
                    </div>
                  </div>`;

                // -- PNR badge --
                const printedRefStr = flight.printedReference && flight.printedReference !== 'Not Provided' ? flight.printedReference : '';
                const legPnrStr     = flight.pnr && flight.pnr !== 'Not Provided' && !flight.pnr.toLowerCase().includes('scan') ? flight.pnr : '';
                let legPnrBadge = '';
                if ((printedRefStr === legPnrStr && legPnrStr !== '') || (printedRefStr === '' && legPnrStr !== '')) {
                  legPnrBadge = `
                    <div style="display:inline-flex;align-items:center;gap:6px;font-size:11px;background:#f8fafc;padding:2px 8px;border-radius:6px;border:1px solid #cbd5e1;color:#334155;font-weight:700;">
                      <span>📱 PNR: <input type="text" value="${legPnrStr}" placeholder="Scan..." style="border:none;background:transparent;outline:none;color:var(--primary);font-weight:800;width:85px;font-size:11px;letter-spacing:1px;text-transform:uppercase;" onfocus="this.select()"></span>
                    </div>`;
                } else {
                  legPnrBadge = `
                    <div style="display:inline-flex;align-items:center;gap:6px;font-size:11px;background:#f8fafc;padding:2px 8px;border-radius:6px;border:1px solid #cbd5e1;color:#334155;font-weight:700;">
                      <span style="color:#64748b;">🖨️ Printed Ref: <span style="color:#475569;">${printedRefStr || 'N/A'}</span></span>
                      <span style="color:#cbd5e1;margin:0 4px;">|</span>
                      <span>📱 True PNR: <input type="text" value="${legPnrStr}" placeholder="Scan..." style="border:none;background:transparent;outline:none;color:var(--primary);font-weight:800;width:85px;font-size:11px;letter-spacing:1px;text-transform:uppercase;" onfocus="this.select()"></span>
                    </div>`;
                }

                // data-partial-date: store raw AI date so Enter button can reconstruct full date
                // blank string = no date (handled by inline picker, not Enter button)
                const partialDateAttr = isMissingDate ? '' : (flight.date || '');

                flightCardsContainer.innerHTML += `
                  <div class="flight-card" style="opacity:${opacityStyle};" data-partial-date="${partialDateAttr}">
                    <div style="display:block;width:100%;">${statusWarningHtml}</div>

                    <div class="fc-top">
                      <div class="fc-airline">${airText}</div>
                      <div class="fc-badge">${legIndicator}</div>
                    </div>

                    <div class="fc-path-container">
                      <div class="fc-node left">
                        <div class="fc-iata">${flight.originIata || '???'}</div>
                        <div class="fc-airport">${flight.originName || ''}</div>
                        <div class="fc-city">${flight.originCity || ''}, ${flight.originCountry || ''}</div>
                        ${originStatute}
                      </div>
                      <div class="fc-line-wrapper">
                        ${distanceHtml}
                        <div class="fc-line"></div>
                        <div class="fc-plane">✈</div>
                      </div>
                      <div class="fc-node right">
                        <div class="fc-iata">${flight.destinationIata || '???'}</div>
                        <div class="fc-airport">${flight.destinationName || ''}</div>
                        <div class="fc-city">${flight.destinationCity || ''}, ${flight.destinationCountry || ''}</div>
                        ${destStatute}
                      </div>
                    </div>

                    <div class="fc-times-row">
                      <div><div class="fc-time">${flight.departureTime || '--:--'}</div></div>
                      <div style="text-align:right;"><div class="fc-time">${flight.arrivalTime || '--:--'}</div></div>
                    </div>

                    <div class="fc-info-strip" style="flex-wrap:wrap;">
                      ${datePillHtml}
                      <span class="fc-strip-sep">·</span>
                      <span class="fc-flight-num" style="display:flex;align-items:center;flex-wrap:wrap;">✈ ${flightNumsDisplay} ${statusBtnsHtml}</span>
                      <span class="fc-strip-sep" style="width:100%;height:1px;background:#e2e8f0;margin:4px 0;"></span>
                      ${legPnrBadge}
                      ${docsHtml ? `<span class="fc-strip-sep" style="width:100%;height:1px;background:#e2e8f0;margin:4px 0;"></span>${docsHtml}` : ''}
                    </div>

                    <div class="fc-footer">
                      <div style="display:flex;gap:8px;align-items:center;">${eocWrapperHtml}</div>
                      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        ${legBadgeHtml}
                        <div class="exp-badge-container" data-years="${expBestYears}" data-country="${expBestCountry}">${expBadgeHtml}</div>
                      </div>
                    </div>
                  </div>`;
              });
            } else {
              flightCardsContainer.innerHTML += '<p style="color:var(--text-muted);font-size:14px;">No leg data found for this route.</p>';
            }
          });
        } else {
          flightCardsContainer.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);background:var(--surface);border-radius:var(--radius-md);border:1px dashed var(--border-soft);">No flight routes detected.</div>`;
        }

        journeyWrapper.appendChild(flightCardsContainer);
        resultsCard.appendChild(journeyWrapper);
      });

      // Show Enter button if any cards have year-missing dates
      if (hasMissingYear) applyYearBtn.style.display = 'inline-flex';

      // Fire EOC checks in parallel (no await — intentional)
      document.querySelectorAll('.fc-eoc-wrapper').forEach(wrapper => {
        runEOCCheck(wrapper, wrapper.closest('.flight-card'));
      });

    } catch (error) {
      if (error.name !== 'AbortError') {
        alert(`Analysis Error: ${error.message}\n\nIf this persists, check the server console.`);
        console.error(error);
      }
    } finally {
      clearInterval(timerInterval);
      analyzeBtn.innerHTML = 'Analyze Document';
      analyzeBtn.disabled  = false;
    }
  });

  // ---------------------------------------------------------------------------
  // SOFT DATE VALIDATOR for flight-status buttons
  // ---------------------------------------------------------------------------
  function validateDateForAPI(btn, flightCard) {
    const dateVal = btn.dataset.date;
    if (!dateVal || dateVal === 'Unknown' || !/\d{4}/.test(dateVal)) {
      const orig = { html: btn.innerHTML, bg: btn.style.background, color: btn.style.color, border: btn.style.border };
      btn.innerHTML    = '⚠️ Date Incomplete';
      btn.style.background = '#fef2f2';
      btn.style.color      = '#dc2626';
      btn.style.border     = '1px solid #fecaca';
      const pill = flightCard.querySelector('.needs-date-warning');
      if (pill) { pill.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.4)'; setTimeout(() => { pill.style.boxShadow = ''; }, 2000); }
      setTimeout(() => { btn.innerHTML = orig.html; btn.style.background = orig.bg; btn.style.color = orig.color; btn.style.border = orig.border; btn.disabled = false; }, 2000);
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // EVENT DELEGATION: inline date set + flight status
  // ---------------------------------------------------------------------------
  resultsCard.addEventListener('click', async (e) => {

    // ---- Inline "✓ Set" button on missing-date cards ----
    const dateSetBtn = e.target.closest('.fc-date-set-btn');
    if (dateSetBtn) {
      const pillWrapper = dateSetBtn.closest('.fc-date-pill-wrapper');
      const picker      = pillWrapper?.querySelector('.fc-inline-date-picker');
      const flightCard  = dateSetBtn.closest('.flight-card');
      if (!picker?.value) { alert('Please select a date first.'); return; }
      dateSetBtn.disabled    = true;
      dateSetBtn.textContent = '⏳';
      await applyDateToCard(flightCard, picker.value);
      return;
    }

    // ---- Flight status "📡 XX Stats" button ----
    const statusBtn = e.target.closest('.btn-check-status');
    if (!statusBtn) return;

    const flightCard = statusBtn.closest('.flight-card');
    if (!validateDateForAPI(statusBtn, flightCard)) return;

    const flightNum = statusBtn.dataset.flight;
    const date      = statusBtn.dataset.date;
    const origin    = statusBtn.dataset.origin;
    const dest      = statusBtn.dataset.dest;

    const origHtml      = statusBtn.innerHTML;
    statusBtn.innerHTML = `⏳ ${flightNum} Thinking...`;
    statusBtn.disabled  = true;

    try {
      const response = await fetch(`/api/flight-status?flightNumber=${encodeURIComponent(flightNum)}&date=${encodeURIComponent(date)}&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}`);
      const data     = await response.json();

      if (data.aiStats) {
        const ai          = data.aiStats;
        const isCancelled = ai.rawStatus === 'C';
        const isDiverted  = ai.rawStatus === 'D';

        const arrSchedHtml = isCancelled
          ? `<div style="font-size:22px;font-weight:700;color:#475569;line-height:1;text-decoration:line-through;opacity:0.5;">${ai.arrSched}</div>`
          : `<div style="font-size:22px;font-weight:700;color:#f8fafc;line-height:1;">${ai.arrSched}</div>`;

        const arrActualHtml = isCancelled
          ? `<div style="font-size:13px;font-weight:700;color:#ef4444;margin-top:6px;">Flight did not operate</div>`
          : ai.arrTimeDataPending
            ? `<div style="font-size:16px;font-weight:700;color:#64748b;line-height:1;">Data Pending</div><div style="font-size:10px;color:#475569;margin-top:4px;">Cirium update expected shortly</div>`
            : `<div style="font-size:22px;font-weight:700;color:${ai.arrDelayColor};line-height:1;">${ai.arrActual}</div>`;

        const divertedCallout = (isDiverted && ai.divertedTo)
          ? `<div style="margin-top:12px;background:#451a03;border:1px solid #854d0e;border-left:3px solid #f59e0b;border-radius:8px;padding:10px 14px;font-size:12px;font-weight:700;color:#fbbf24;text-align:right;">⚠️ Diverted to ${ai.divertedTo}${ai.divertedToCity ? ` — ${ai.divertedToCity}` : ''}</div>`
          : '';

        const statsCard = document.createElement('div');
        statsCard.style.cssText = 'margin-top:20px;border-radius:16px;overflow:hidden;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1),0 10px 10px -5px rgba(0,0,0,0.04);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;animation:fadeIn 0.4s ease;';
        statsCard.innerHTML = `
          <div style="background:${ai.bannerBg};color:${ai.bannerTextCol};text-align:center;padding:14px;font-size:15px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;">
            ${ai.bannerText} (${flightNum})
          </div>
          <div style="background:#0f172a;color:#fff;padding:24px;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
              <div style="flex:1;min-width:0;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;display:flex;align-items:center;gap:6px;overflow:hidden;">
                <span style="flex-shrink:0;">✈️</span>
                <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ai.operatorName}</span>
              </div>
              <div style="flex-shrink:0;background:#1e293b;border:1px solid #334155;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:700;color:#94a3b8;display:flex;align-items:center;gap:6px;">⏱️ ${ai.flightDuration}</div>
              <div style="flex:1;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div style="text-align:left;flex:1;">
                <div style="font-size:56px;font-weight:800;line-height:1;letter-spacing:-2px;margin-bottom:8px;">${ai.depIata}</div>
                <div style="font-size:15px;color:#94a3b8;font-weight:500;">${ai.depCity}</div>
              </div>
              <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:0 10px;opacity:0.6;">
                <div style="height:2px;background:repeating-linear-gradient(to right,#cbd5e1 0,#cbd5e1 6px,transparent 6px,transparent 12px);width:100%;"></div>
                <div style="font-size:28px;transform:rotate(90deg);margin-left:-14px;color:#cbd5e1;">✈</div>
              </div>
              <div style="text-align:right;flex:1;">
                <div style="font-size:56px;font-weight:800;line-height:1;letter-spacing:-2px;margin-bottom:8px;">${ai.arrIata}</div>
                <div style="font-size:15px;color:#94a3b8;font-weight:500;">${ai.arrCity}</div>
              </div>
            </div>
            <div style="background:#1e293b;border-radius:16px;padding:20px;margin-top:32px;display:flex;justify-content:space-between;box-shadow:inset 0 2px 4px rgba(0,0,0,0.1);">
              <div style="flex:1;">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#64748b;margin-bottom:16px;font-weight:800;">Departure Gate</div>
                <div style="margin-bottom:16px;">
                  <div style="font-size:13px;color:#94a3b8;margin-bottom:4px;display:flex;align-items:center;gap:6px;">Scheduled <span style="background:#334155;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;">${ai.depSchedZone}</span></div>
                  <div style="font-size:22px;font-weight:700;color:#f8fafc;line-height:1;">${ai.depSched}</div>
                  <div style="font-size:12px;color:#64748b;margin-top:4px;">${ai.depDate}</div>
                </div>
                <div>
                  <div style="font-size:13px;color:#94a3b8;margin-bottom:4px;display:flex;align-items:center;gap:6px;">${ai.depActualLabel} <span style="background:#334155;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;">${ai.depActualZone}</span></div>
                  <div style="font-size:22px;font-weight:700;color:#f8fafc;line-height:1;">${ai.depActual}</div>
                </div>
              </div>
              <div style="width:1px;background:#334155;margin:0 20px;"></div>
              <div style="flex:1;text-align:right;${isCancelled ? 'opacity:0.45;' : ''}">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#64748b;margin-bottom:16px;font-weight:800;">Arrival Gate</div>
                <div style="margin-bottom:12px;">
                  <div style="font-size:13px;color:#94a3b8;margin-bottom:4px;display:flex;align-items:center;justify-content:flex-end;gap:6px;"><span style="background:#334155;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;">${ai.arrSchedZone}</span> Scheduled</div>
                  ${arrSchedHtml}
                  <div style="font-size:12px;color:#64748b;margin-top:4px;">${ai.arrDate}</div>
                </div>
                <div>
                  <div style="font-size:13px;color:#94a3b8;margin-bottom:4px;display:flex;align-items:center;justify-content:flex-end;gap:6px;"><span style="background:#334155;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;">${ai.arrActualZone}</span> ${ai.arrActualLabel}</div>
                  ${arrActualHtml}
                </div>
                ${divertedCallout}
              </div>
            </div>
            <div style="margin-top:24px;text-align:center;border-top:1px dashed #334155;padding-top:20px;">
              <span style="font-size:13px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Flight Status:</span>
              <strong style="margin-left:10px;font-size:18px;color:${ai.arrDelayColor};background:${ai.arrDelayColor}15;border:1px solid ${ai.arrDelayColor}30;padding:6px 16px;border-radius:8px;">${ai.arrDelay}</strong>
            </div>
          </div>`;

        flightCard.appendChild(statsCard);
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