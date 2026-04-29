/* =============================================================================
   tools.js — Manual Tools Suite
   Reads window.JURISDICTION_LIMITS which is injected by tools.pug from the
   server-side jurisdiction_data.json via toolsController.renderTools().
   ============================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  window.searchedFlights = new Set();

  // ---------------------------------------------------------------------------
  // TAB SWITCHING
  // ---------------------------------------------------------------------------
  const tabBtns     = document.querySelectorAll('.ts-tab-btn');
  const tabContents = document.querySelectorAll('.ts-tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b     => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  // ---------------------------------------------------------------------------
  // DATE FORMATTING UTILITIES
  // ---------------------------------------------------------------------------
  function formatDateForDisplay(dateStr) {
    if (!dateStr) return '';
    // Parse YYYY-MM-DD format and format as "4 April, 2026"
    const date = new Date(dateStr + 'T00:00:00Z'); // Add time to avoid timezone issues
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  function parseDateFromDisplay(userInput) {
    if (!userInput) return null;
    const input = userInput.trim();

    // Try YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      const date = new Date(input + 'T00:00:00Z');
      if (!isNaN(date.getTime())) return input;
    }

    // Try DD/MM/YYYY or D/M/YYYY format
    const slashMatch = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      const [_, day, month, year] = slashMatch;
      const date = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`);
      if (!isNaN(date.getTime())) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }

    // Try "4 April, 2026" or "04 April 2026" format
    const dateWithMonthMatch = input.match(/^(\d{1,2})\s+(\w+),?\s+(\d{4})$/);
    if (dateWithMonthMatch) {
      const [_, day, monthName, year] = dateWithMonthMatch;
      const monthIndex = new Date(`${monthName} 1, 2000`).getMonth();
      if (monthIndex !== -1) {
        return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }

    // Try parsing as Date and format if valid
    const parsed = new Date(input);
    if (!isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // SMART DATE HANDLERS FOR E-DATE (EOC Flight Date)
  // ---------------------------------------------------------------------------
  const eDatePicker = document.getElementById('e-date-picker');
  const eDate = document.getElementById('e-date');

  // When user selects a date from the date picker
  if (eDatePicker) {
    eDatePicker.addEventListener('change', () => {
      if (eDatePicker.value) {
        eDate.value = formatDateForDisplay(eDatePicker.value);
      }
    });
  }

  // When user types or pastes in the display input
  if (eDate) {
    eDate.addEventListener('paste', (e) => {
      e.preventDefault();
      const pastedText = (e.clipboardData || window.clipboardData).getData('text');
      const parsed = parseDateFromDisplay(pastedText);
      if (parsed) {
        eDatePicker.value = parsed;
        eDate.value = formatDateForDisplay(parsed);
      } else {
        alert('Could not automatically read that date. Please use the calendar or type a date format like "4 April 2026" or "04/04/2026".');
      }
    });

    eDate.addEventListener('input', () => {
      const parsed = parseDateFromDisplay(eDate.value);
      if (parsed) {
        eDatePicker.value = parsed;
      }
    });
  }

  // Handle c-date (FlightStats tab) paste if it exists
  const cDate = document.getElementById('c-date');
  if (cDate) {
    cDate.addEventListener('paste', (e) => {
      e.preventDefault();
      const pastedText = (e.clipboardData || window.clipboardData).getData('text');
      const parsed = parseDateFromDisplay(pastedText);
      if (parsed) {
        cDate.value = parsed;
      } else {
        alert('Could not automatically read that date. Please use the calendar or type YYYY-MM-DD.');
      }
    });
  }

  // ---------------------------------------------------------------------------
  // AIRPORT AUTOCOMPLETE
  // ---------------------------------------------------------------------------
  function setupAirportAutocomplete(inputId, countryInputId = null) {
    const input        = document.getElementById(inputId);
    const countryInput = countryInputId ? document.getElementById(countryInputId) : null;
    if (!input) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'autocomplete-wrapper';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const list = document.createElement('div');
    list.className = 'autocomplete-list';
    wrapper.appendChild(list);

    let timeout = null;

    input.addEventListener('input', (e) => {
      e.target.removeAttribute('data-iata');
      e.target.removeAttribute('data-country');
      e.target.removeAttribute('data-lat');
      e.target.removeAttribute('data-lon');
      if (countryInput) countryInput.value = '';

      clearTimeout(timeout);
      const val = e.target.value;
      if (val.length < 2) { list.style.display = 'none'; return; }

      timeout = setTimeout(async () => {
        try {
          const res  = await fetch(`/api/tools/search-airports?q=${encodeURIComponent(val)}`);
          const data = await res.json();
          list.innerHTML = '';

          if (data.length > 0) {
            list.style.display = 'block';
            data.forEach(airport => {
              const item = document.createElement('div');
              item.className = 'autocomplete-item';
              item.innerHTML = `
                <div class="ac-top" style="align-items: center;">
                  <span class="ac-iata" style="background: #f1f5f9; padding: 4px 8px; border-radius: 6px; margin-right: 8px;">${airport.iata}</span>
                  <span class="ac-city" style="color: #334155;">${airport.name}, ${airport.city}, ${airport.country}</span>
                </div>`;
              item.addEventListener('click', () => {
                input.value              = `${airport.name}, ${airport.city}`;
                input.dataset.iata       = airport.iata;
                input.dataset.country    = airport.country;
                input.dataset.lat        = airport.lat;
                input.dataset.lon        = airport.lon;
                if (countryInput) countryInput.value = airport.country;
                list.style.display = 'none';
              });
              list.appendChild(item);
            });
          } else {
            list.style.display = 'none';
          }
        } catch (err) {
          list.style.display = 'none';
        }
      }, 150);
    });

    document.addEventListener('click', (e) => { if (e.target !== input) list.style.display = 'none'; });
  }

  setupAirportAutocomplete('e-o-iata', 'e-o-country');
  setupAirportAutocomplete('e-d-iata', 'e-d-country');
  setupAirportAutocomplete('l-origin', 'l-origin-country');
  setupAirportAutocomplete('l-dest',   'l-dest-country');

  // ---------------------------------------------------------------------------
  // JURISDICTION CHECKER
  // Read from window.JURISDICTION_LIMITS injected by tools.pug via the server.
  // Adding a new country only requires editing jurisdiction_data.json.
  // ---------------------------------------------------------------------------
  const jurisdictionLimits = window.JURISDICTION_LIMITS || {};

  function displayJurisdictionResult(query) {
    const jResult = document.getElementById('jurisdictionResult');
    if (!query) { jResult.innerHTML = ''; return; }

    const match = jurisdictionLimits[query];

    if (match !== undefined) {
      jResult.innerHTML = `
        <div style="background: #fffbeb; border: 1px solid #fde68a; padding: 20px; border-radius: 12px; width: 100%; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 20px; animation: ts-fadeIn 0.3s ease;">
          <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 80px;">
            <span style="font-size: 24px;">🏛️</span>
            <span style="font-size: 16px; font-weight: 800; color: #b45309; text-transform: capitalize;">${query}</span>
          </div>
          <div style="background: #fef3c7; padding: 14px 20px; border-radius: 8px; border: 1px solid #fcd34d; display: flex; align-items: center; gap: 8px; white-space: nowrap; flex-grow: 1; max-width: max-content; justify-content: center;">
            <span style="font-size: 18px;">⚖️</span>
            <span style="font-size: 16px; font-weight: 800; color: #d97706;">Limit: ${match} years</span>
          </div>
        </div>`;
    } else {
      const partials = Object.keys(jurisdictionLimits).filter(k => k.includes(query));
      if (partials.length > 0) {
        jResult.innerHTML = `<div style="color: #64748b; font-size: 14px; padding: 10px;">Did you mean: ${
          partials.map(p =>
            `<span style="color:var(--primary);cursor:pointer;font-weight:600;text-transform:capitalize;"
                   onclick="document.getElementById('j-country').value='${p}';
                            document.getElementById('j-country').dispatchEvent(new Event('input'))">${p}</span>`
          ).join(', ')
        }?</div>`;
      } else {
        jResult.innerHTML = `
          <div style="background: #f1f5f9; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; color: #64748b; font-weight: 600;">
            No specific EC261 jurisdiction limit found for "${query}".
          </div>`;
      }
    }
  }

  function setupJurisdictionAutocomplete(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'autocomplete-wrapper';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const list = document.createElement('div');
    list.className = 'autocomplete-list';
    wrapper.appendChild(list);

    let timeout = null;

    input.addEventListener('input', (e) => {
      clearTimeout(timeout);
      const val = e.target.value.toLowerCase().trim();

      displayJurisdictionResult(val);
      if (val.length < 1) { list.style.display = 'none'; return; }

      timeout = setTimeout(() => {
        const matches = Object.keys(jurisdictionLimits).filter(k => k.includes(val) && k !== val);
        list.innerHTML = '';

        if (matches.length > 0) {
          list.style.display = 'block';
          matches.forEach(country => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.innerHTML = `
              <div class="ac-top" style="align-items: center; padding: 4px 0;">
                <span class="ac-city" style="color: #334155; font-weight: 600; font-size: 14px; text-transform: capitalize;">🏛️ ${country}</span>
              </div>`;
            item.addEventListener('click', () => {
              input.value        = country;
              list.style.display = 'none';
              displayJurisdictionResult(country);
            });
            list.appendChild(item);
          });
        } else {
          list.style.display = 'none';
        }
      }, 150);
    });

    document.addEventListener('click', (e) => { if (e.target !== input) list.style.display = 'none'; });
  }

  setupJurisdictionAutocomplete('j-country');

  // ---------------------------------------------------------------------------
  // DOCUMENT CHECKER — fetch + display
  // ---------------------------------------------------------------------------
  async function fetchAndDisplayDocs(airlineName) {
    const resultDiv = document.getElementById('docsResult');
    resultDiv.innerHTML = `<div style="text-align: center; padding: 20px; color: #64748b; font-weight: 600;">⏳ Checking requirements for ${airlineName}...</div>`;

    try {
      const res  = await fetch(`/api/tools/check-docs?airline=${encodeURIComponent(airlineName)}`);
      const data = await res.json();

      const statusBadge = data.hasDocs
        ? `<div style="font-size: 11px; font-weight: 800; color: #b45309; background: #fef3c7; padding: 4px 10px; border-radius: 6px; display: inline-block; border: 1px solid #fde68a;">⚠️ DOCUMENTS REQUIRED</div>`
        : `<div style="font-size: 11px; font-weight: 800; color: #16a34a; background: #dcfce7; padding: 4px 10px; border-radius: 6px; display: inline-block; border: 1px solid #bbf7d0;">✅ NO EXTRA DOCS REQUIRED</div>`;

      const reqsDisplay = data.hasDocs
        ? `<div style="font-size: 15px; font-weight: 600; color: #0f172a; line-height: 1.5;">${data.reqs}</div>`
        : `<div style="font-size: 15px; font-weight: 600; color: #16a34a; line-height: 1.5;">${data.reqs}</div>`;

      const jurisdictionKey = (data.country || '').toLowerCase().trim();
      const jurisdictionVal = jurisdictionLimits[jurisdictionKey];
      const jurisdictionSuffix = jurisdictionVal !== undefined ? ` · ${jurisdictionVal} yrs` : '';

      resultDiv.innerHTML = `
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 24px; border-radius: 12px; width: 100%; animation: ts-fadeIn 0.4s ease;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
            <div>
              <div style="font-size: 18px; font-weight: 800; color: #0f172a; text-transform: capitalize;">✈️ ${data.airline}</div>
              <div style="display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap;">
                <span style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 6px; padding: 3px 10px; font-size: 11px; font-weight: 700;">IATA: ${data.iata}</span>
                <span style="background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; border-radius: 6px; padding: 3px 10px; font-size: 11px; font-weight: 700;">ICAO: ${data.icao}</span>
                <span style="background: #faf5ff; color: #7e22ce; border: 1px solid #e9d5ff; border-radius: 6px; padding: 3px 10px; font-size: 11px; font-weight: 700;">🌍 ${data.country}${jurisdictionSuffix}</span>
              </div>
            </div>
            ${statusBadge}
          </div>
          <div style="border-top: 1px solid #cbd5e1; padding-top: 16px;">
            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px;">Required Claim Documents</div>
            ${reqsDisplay}
          </div>
        </div>`;
    } catch (err) {
      resultDiv.innerHTML = `<div style="background: #fef2f2; color: #991b1b; padding: 16px; border-radius: 8px; font-weight: 700; border: 1px solid #fecaca;">❌ Error fetching document requirements.</div>`;
    }
  }

  // ---------------------------------------------------------------------------
  // AIRLINE AUTOCOMPLETE
  // ---------------------------------------------------------------------------
  function setupAirlineAutocomplete(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'autocomplete-wrapper';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const list = document.createElement('div');
    list.className = 'autocomplete-list';
    wrapper.appendChild(list);

    let timeout = null;

    input.addEventListener('input', (e) => {
      clearTimeout(timeout);
      const val = e.target.value;
      if (val.length < 2) { list.style.display = 'none'; return; }

      timeout = setTimeout(async () => {
        try {
          const res  = await fetch(`/api/tools/search-airlines?q=${encodeURIComponent(val)}`);
          const data = await res.json();
          list.innerHTML = '';

          if (data.length > 0) {
            const valLower = val.toLowerCase();
            const exactMatch = data.find(airline =>
              airline.name.toLowerCase() === valLower ||
              (airline.iata && airline.iata.toLowerCase() !== 'na' && airline.iata.toLowerCase() === valLower)
            );
            if (exactMatch) {
              fetchAndDisplayDocs(exactMatch.name);
              list.style.display = 'none';
            } else {
              list.style.display = 'block';
            }

            data.forEach(airline => {
              const item = document.createElement('div');
              item.className = 'autocomplete-item';
              item.innerHTML = `
                <div class="ac-top" style="align-items: center; padding: 4px 0;">
                  <span class="ac-city" style="color: #334155; font-weight: 600; font-size: 14px;">${airline.name}</span>
                </div>`;
              item.addEventListener('click', () => {
                input.value        = airline.name;
                list.style.display = 'none';
                fetchAndDisplayDocs(airline.name);
              });
              list.appendChild(item);
            });
          } else {
            list.style.display = 'none';
          }
        } catch (err) {
          list.style.display = 'none';
        }
      }, 150);
    });

    document.addEventListener('click', (e) => { if (e.target !== input) list.style.display = 'none'; });
  }

  setupAirlineAutocomplete('d-airline');

  // ---------------------------------------------------------------------------
  // CIRIUM FLIGHT STATUS
  // ---------------------------------------------------------------------------
  document.getElementById('btn-fetch-cirium').addEventListener('click', async (e) => {
    const btn         = e.target;
    const flightInput = document.getElementById('c-flight');
    const dateInput   = document.getElementById('c-date');
    const flight      = flightInput.value.trim().toUpperCase();
    const date        = dateInput.value;
    const resultDiv   = document.getElementById('flightResult');

    if (!flight || !date) return alert('Flight Number and Date required!');

    const flightKey = `${flight}-${date}`;
    if (window.searchedFlights.has(flightKey)) {
      return alert('This exact flight and date combination is already displayed below!');
    }

    const originalText    = btn.innerHTML;
    btn.innerHTML         = '⏳ Searching...';
    btn.disabled          = true;

    try {
      const res  = await fetch(`/api/tools/flight-status?flightNumber=${encodeURIComponent(flight)}&date=${encodeURIComponent(date)}`);
      const data = await res.json();

      const cardWrapper         = document.createElement('div');
      cardWrapper.className     = 'fetched-flight-card';
      cardWrapper.style.marginBottom = '20px';

      if (data.aiStats) {
        window.searchedFlights.add(flightKey);
        const ai            = data.aiStats;
        const dismissLogic  = `window.searchedFlights.delete('${flightKey}'); this.closest('.fetched-flight-card').remove();`;
        const isCancelled   = ai.rawStatus === 'C';
        const isDiverted    = ai.rawStatus === 'D';

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

        cardWrapper.innerHTML = `
          <div style="border-radius:16px;overflow:hidden;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1),0 10px 10px -5px rgba(0,0,0,0.04);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;animation:fadeIn 0.4s ease;max-width:500px;position:relative;">
            <button type="button" onclick="${dismissLogic}" style="position:absolute;top:12px;right:12px;background:rgba(0,0,0,0.2);border:none;color:#ffffff;cursor:pointer;font-size:14px;z-index:10;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;transition:0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.5)'" onmouseout="this.style.background='rgba(0,0,0,0.2)'" title="Dismiss">✖</button>
            <div style="background:${ai.bannerBg};color:${ai.bannerTextCol};text-align:center;padding:14px;font-size:15px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;">
              ${ai.bannerText} (${flight})
            </div>
            <div style="background:#0f172a;color:#ffffff;padding:24px;">
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
                <div style="flex:1;min-width:0;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;display:flex;align-items:center;gap:6px;overflow:hidden;">
                  <span style="flex-shrink:0;">✈️</span>
                  <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ai.operatorName}</span>
                </div>
                <div style="flex-shrink:0;background:#1e293b;border:1px solid #334155;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:700;color:#94a3b8;display:flex;align-items:center;gap:6px;box-shadow:0 4px 6px rgba(0,0,0,0.2);">
                  ⏱️ ${ai.flightDuration}
                </div>
                <div style="flex:1;"></div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="text-align:left;flex:1;">
                  <div style="font-size:56px;font-weight:800;line-height:1;letter-spacing:-2px;margin-bottom:8px;">${ai.depIata}</div>
                  <div style="font-size:15px;color:#94a3b8;font-weight:500;">${ai.depCity}</div>
                </div>
                <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:0 10px;opacity:0.6;">
                  <div style="height:2px;background:repeating-linear-gradient(to right,#cbd5e1 0,#cbd5e1 6px,transparent 6px,transparent 12px);width:100%;"></div>
                  <div style="font-size:28px;margin-left:-14px;color:#cbd5e1;">✈</div>
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
            </div>
          </div>`;

        resultDiv.insertBefore(cardWrapper, resultDiv.firstChild);
        flightInput.value = '';
      } else {
        cardWrapper.innerHTML = `
          <div style="background:#fef2f2;color:#991b1b;padding:16px;border-radius:8px;font-weight:700;border:1px solid #fecaca;position:relative;">
            ⚠️ Flight ${flight}: ${data.error || 'No Data'}
            <button type="button" onclick="this.parentElement.parentElement.remove()" style="position:absolute;right:16px;top:16px;background:none;border:none;font-size:16px;cursor:pointer;color:#ef4444;">✖</button>
          </div>`;
        resultDiv.insertBefore(cardWrapper, resultDiv.firstChild);
      }
    } catch (err) {
      const errDiv = document.createElement('div');
      errDiv.innerHTML = `
        <div style="background:#fef2f2;color:#991b1b;padding:16px;border-radius:8px;font-weight:700;border:1px solid #fecaca;margin-bottom:16px;position:relative;">
          ❌ Error fetching data for ${flight}.
          <button type="button" onclick="this.parentElement.remove()" style="position:absolute;right:16px;top:16px;background:none;border:none;font-size:16px;cursor:pointer;color:#ef4444;">✖</button>
        </div>`;
      resultDiv.insertBefore(errDiv, resultDiv.firstChild);
    }

    btn.innerHTML = originalText;
    btn.disabled  = false;
  });

  // ---------------------------------------------------------------------------
  // EOC SCANNER
  // ---------------------------------------------------------------------------
  document.getElementById('btn-eoc').addEventListener('click', async (e) => {
    const btn       = e.target;
    const date      = document.getElementById('e-date-picker').value;
    const oInput    = document.getElementById('e-o-iata');
    const dInput    = document.getElementById('e-d-iata');
    const oIata     = oInput.dataset.iata || oInput.value.trim();
    const dIata     = dInput.dataset.iata || dInput.value.trim();
    const oCount    = document.getElementById('e-o-country').value.trim();
    const dCount    = document.getElementById('e-d-country').value.trim();
    const resultDiv = document.getElementById('eocResult');

    if (!date) return alert('Date is required to scan EOCs!');

    btn.innerHTML = '⏳ Scanning...';
    btn.disabled  = true;

    try {
      const query = `date=${date}&originIata=${encodeURIComponent(oIata)}&destIata=${encodeURIComponent(dIata)}&originCountry=${encodeURIComponent(oCount)}&destCountry=${encodeURIComponent(dCount)}`;
      const res   = await fetch(`/api/tools/check-eoc?${query}`);
      const data  = await res.json();

      if (data.eocFound && data.events && data.events.length > 0) {
        const headerText = data.events.length > 1
          ? `⚠️ MULTIPLE EXTRAORDINARY CIRCUMSTANCES DETECTED (${data.events.length})`
          : `⚠️ EXTRAORDINARY CIRCUMSTANCE DETECTED`;

        const eventsHtml = data.events.map((ev, index) => `
          <div style="${index > 0 ? 'margin-top:12px;padding-top:12px;border-top:1px dashed #fca5a5;' : ''}color:#450a0a;display:grid;grid-template-columns:max-content 1fr;gap:8px 12px;align-items:baseline;">
            <strong style="color:#991b1b;">Category:</strong> <span>${ev.category}</span>
            <strong style="color:#991b1b;">Event:</strong>    <span>${ev.event}</span>
            <strong style="color:#991b1b;">Location:</strong> <span>${ev.location}</span>
            <strong style="color:#991b1b;">Decision:</strong> <span style="font-weight:800;color:#dc2626;">${ev.decision}</span>
          </div>`).join('');

        resultDiv.innerHTML = `
          <div class="eoc-alert-active" style="background:#fef2f2;border:1px solid #fecaca;border-left:4px solid #ef4444;padding:20px;border-radius:8px;color:#7f1d1d;">
            <div style="font-weight:800;color:#dc2626;margin-bottom:12px;text-transform:uppercase;font-size:13px;">${headerText}</div>
            ${eventsHtml}
          </div>`;
      } else {
        resultDiv.innerHTML = `<div style="background:#dcfce7;color:#166534;padding:16px;border-radius:8px;font-weight:700;border:1px solid #bbf7d0;">✅ No EOCs found for this route on this date.</div>`;
      }
    } catch (err) {
      resultDiv.innerHTML = '❌ Error scanning EOC database.';
    }

    btn.innerHTML = '⚠️ Scan EOC Database';
    btn.disabled  = false;
  });

  // ---------------------------------------------------------------------------
  // EOC SYNC
  // ---------------------------------------------------------------------------
  document.getElementById('btn-sync-eoc').addEventListener('click', async () => {
    const btn       = document.getElementById('btn-sync-eoc');
    const resultDiv = document.getElementById('syncEocResult');
    const orig      = btn.innerHTML;

    btn.innerHTML = '⏳ Syncing...';
    btn.disabled  = true;
    resultDiv.innerHTML = '';

    try {
      const res  = await fetch('/api/tools/sync-eoc', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        const deltaColor = data.delta > 0 ? '#16a34a' : (data.delta < 0 ? '#dc2626' : '#64748b');
        const deltaLabel = data.delta > 0 ? `+${data.delta} new` : (data.delta < 0 ? `${data.delta} removed` : 'no change');
        resultDiv.innerHTML = `<div style="background:#f0fdf4;color:#166534;padding:12px 16px;border-radius:8px;font-weight:700;border:1px solid #bbf7d0;margin-bottom:12px;font-size:13px;">✅ Synced ${data.newCount} records <span style="color:${deltaColor};margin-left:8px;">(${deltaLabel})</span></div>`;
      } else {
        resultDiv.innerHTML = `<div style="background:#fef2f2;color:#991b1b;padding:12px 16px;border-radius:8px;font-weight:700;border:1px solid #fecaca;margin-bottom:12px;font-size:13px;">❌ Sync failed: ${data.error || 'Unknown error'}</div>`;
      }
    } catch {
      resultDiv.innerHTML = `<div style="background:#fef2f2;color:#991b1b;padding:12px 16px;border-radius:8px;font-weight:700;border:1px solid #fecaca;margin-bottom:12px;font-size:13px;">❌ Network error during sync.</div>`;
    }

    btn.innerHTML = orig;
    btn.disabled  = false;
  });

  // ---------------------------------------------------------------------------
  // COMPENSATION CALCULATOR
  // ---------------------------------------------------------------------------
  document.getElementById('btn-ec261').addEventListener('click', () => {
    const oInput    = document.getElementById('l-origin');
    const dInput    = document.getElementById('l-dest');
    const resultDiv = document.getElementById('ec261Result');

    if (!oInput.value || !dInput.value) return alert('Origin and Destination are required!');

    let dist = 0;
    const lat1 = parseFloat(oInput.dataset.lat);
    const lon1 = parseFloat(oInput.dataset.lon);
    const lat2 = parseFloat(dInput.dataset.lat);
    const lon2 = parseFloat(dInput.dataset.lon);

    const originCountry = (oInput.dataset.country || document.getElementById('l-origin-country').value || '').trim().toLowerCase();
    const destCountry   = (dInput.dataset.country || document.getElementById('l-dest-country').value   || '').trim().toLowerCase();

    if (!isNaN(lat1) && !isNaN(lon1) && !isNaN(lat2) && !isNaN(lon2) && (lat1 !== 0 || lon1 !== 0)) {
      const R    = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a    = Math.sin(dLat/2) * Math.sin(dLat/2) +
                   Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                   Math.sin(dLon/2) * Math.sin(dLon/2);
      dist = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    } else {
      const manualDist = prompt('Please select airports from the dropdown so we can calculate GPS distance, OR manually enter the flight distance in KM here:');
      if (manualDist === null || manualDist.trim() === '') return;
      dist = parseFloat(manualDist);
      if (isNaN(dist)) return alert('A valid number is required for distance.');
    }

    const euList = [
      'austria','belgium','bulgaria','croatia','cyprus','czech republic','denmark',
      'estonia','finland','france','germany','greece','hungary','ireland','italy',
      'latvia','lithuania','luxembourg','malta','netherlands','the netherlands',
      'poland','portugal','romania','slovakia','slovenia','spain','sweden',
      'iceland','norway','switzerland','united kingdom','uk',
      'guadeloupe','reunion','martinique','french guiana','mayotte',
    ];
    const isOriginEU = euList.includes(originCountry);
    const isDestEU   = euList.includes(destCountry);

    let comp = '€250';
    let type = 'Short Haul';
    if (dist > 1500 && dist <= 3500) {
      comp = '€400'; type = 'Medium Haul';
    } else if (dist > 3500) {
      if (isOriginEU && isDestEU) { comp = '€400'; type = 'Intra-EU Long Haul (Capped)'; }
      else                        { comp = '€600'; type = 'Long Haul'; }
    }

    resultDiv.innerHTML = `
      <div style="background:#f8fafc;border:1px solid #cbd5e1;padding:24px;border-radius:12px;display:grid;grid-template-columns:1fr 1fr;gap:16px;animation:ts-fadeIn 0.4s ease;">
        <div>
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Flight Distance</div>
          <div style="font-size:20px;font-weight:800;color:#0f172a;">${dist} km</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px;">${type}</div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Compensation Amount</div>
          <div style="font-size:24px;font-weight:800;color:#16a34a;">💸 ${comp}</div>
        </div>
      </div>`;
  });

  // ---------------------------------------------------------------------------
  // IATA LOOKUP
  // ---------------------------------------------------------------------------
  const iataInput     = document.getElementById('iata-lookup-input');
  const iataBtn       = document.getElementById('btn-iata-lookup');
  const iataResultDiv = document.getElementById('iata-lookup-result');

  async function runIataLookup() {
    const val = (iataInput.value || '').trim().toLowerCase();
    if (val.length < 2) {
      iataResultDiv.innerHTML = `<div style="color:#64748b;font-size:14px;padding:8px 0;">Enter at least 2 characters.</div>`;
      return;
    }
    iataBtn.innerHTML = '⏳ Searching...';
    iataBtn.disabled  = true;
    try {
      const res  = await fetch(`/api/tools/lookup-iata?q=${encodeURIComponent(val)}`);
      const data = await res.json();

      if (!data.length) {
        iataResultDiv.innerHTML = `
          <div style="background:#f1f5f9;border:1px solid #e2e8f0;padding:16px;border-radius:8px;color:#64748b;font-weight:600;">
            No airlines found for "${val}".
          </div>`;
        return;
      }

      const rows = data.map(a => `
        <tr>
          <td style="padding:10px 12px;font-weight:700;color:#0f172a;">${a.name}</td>
          <td style="padding:10px 12px;text-align:center;">
            <span style="background:#f1f5f9;padding:3px 8px;border-radius:5px;font-weight:800;font-size:13px;color:#1e293b;">${a.iata || '—'}</span>
          </td>
          <td style="padding:10px 12px;text-align:center;">
            <span style="background:#eff6ff;padding:3px 8px;border-radius:5px;font-weight:700;font-size:13px;color:#1d4ed8;">${a.icao || '—'}</span>
          </td>
          <td style="padding:10px 12px;color:#475569;font-size:13px;">${a.country || '—'}</td>
        </tr>`).join('');

      iataResultDiv.innerHTML = `
        <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead>
              <tr style="background:#e2e8f0;">
                <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Airline</th>
                <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">IATA</th>
                <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">ICAO</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Country</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    } catch (err) {
      iataResultDiv.innerHTML = `<div style="background:#fef2f2;color:#991b1b;padding:16px;border-radius:8px;font-weight:700;border:1px solid #fecaca;">❌ Error fetching IATA data.</div>`;
    } finally {
      iataBtn.innerHTML = '🔍 Search';
      iataBtn.disabled  = false;
    }
  }

  if (iataBtn)   iataBtn.addEventListener('click', runIataLookup);
  if (iataInput) iataInput.addEventListener('keydown', e => { if (e.key === 'Enter') runIataLookup(); });

  // ---------------------------------------------------------------------------
  // FLIGHT SEARCH (open 3 tracker tabs)
  // ---------------------------------------------------------------------------
  const fsFlightInput = document.getElementById('fs-flight');
  const fsDateInput   = document.getElementById('fs-date');

  if (fsDateInput) {
    fsDateInput.addEventListener('paste', (e) => {
      e.preventDefault();
      const pastedText = (e.clipboardData || window.clipboardData).getData('text');
      const parsed = parseDateFromDisplay(pastedText);
      if (parsed) {
        fsDateInput.value = parsed;
      } else {
        alert('Could not read that date. Please use the calendar or type YYYY-MM-DD.');
      }
    });
  }

  document.getElementById('btn-flight-search').addEventListener('click', () => {
    const raw  = (fsFlightInput.value || '').trim();
    const date = fsDateInput.value;

    if (!raw || !date) return alert('Flight number and date are required!');

    const match = raw.match(/^([A-Za-z]{3}|[A-Za-z0-9]{2})\s*(\d{1,4})$/);
    if (!match) return alert('Invalid flight number. Examples: VY7835, U2 8412, EZY1234');

    const airline  = match[1].toUpperCase();
    const num      = match[2];
    const numClean = String(parseInt(num, 10));
    const [year, month, day] = date.split('-');
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    const chkAi = document.getElementById('fs-chk-ai');
    const chkFs = document.getElementById('fs-chk-fs');
    const chkFt = document.getElementById('fs-chk-ft');

    if (!chkAi.checked && !chkFs.checked && !chkFt.checked) return alert('Select at least one tracker.');

    if (chkAi.checked) window.open(`https://airportinfo.live/flight/${(airline + num).toLowerCase()}?d=${date}`, '_blank');
    if (chkFs.checked) window.open(`https://www.flightstats.com/v2/historical-flight/${airline.toUpperCase()}/${numClean}/${year}/${parseInt(month)}/${parseInt(day)}`, '_blank');
    if (chkFt.checked) window.open(`https://www.flightera.net/en/flight/${airline.toUpperCase()}${numClean}/${monthNames[parseInt(month) - 1]}-${year}#flight_list`, '_blank');
  });

  if (fsFlightInput) {
    fsFlightInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-flight-search').click();
    });
  }

  // ---------------------------------------------------------------------------
  // SMART EMAIL BUILDER
  // ---------------------------------------------------------------------------

  // Language persistence
  const emLanguageSelect = document.getElementById('emLanguage');
  if (localStorage.getItem('emLastLanguage')) {
    emLanguageSelect.value = localStorage.getItem('emLastLanguage');
  }
  emLanguageSelect.addEventListener('change', () => {
    localStorage.setItem('emLastLanguage', emLanguageSelect.value);
  });

  // Inner tab switching
  document.querySelectorAll('.em-inner-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.em-inner-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.em-inner-tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const tabId = 'emTab' + btn.dataset.emTab.charAt(0).toUpperCase() + btn.dataset.emTab.slice(1);
      document.getElementById(tabId).classList.add('active');
      const isRequest = btn.dataset.emTab === 'request';
      document.getElementById('emSidebarRequest').style.display = isRequest ? '' : 'none';
      document.getElementById('emSidebarDraft').style.display   = isRequest ? 'none' : '';
    });
  });

  // Toggle custom note area
  const emUseNote = document.getElementById('emUseNote');
  const emNoteArea = document.getElementById('emNoteArea');
  if (emUseNote) {
    emUseNote.addEventListener('change', () => {
      emNoteArea.style.display = emUseNote.checked ? 'block' : 'none';
    });
  }

  // Form submission
  document.getElementById('emailBuilderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn            = document.getElementById('emGenerateBtn');
    const resultBox      = document.getElementById('emResultBox');
    const outputText     = document.getElementById('emOutputText');
    const englishBox     = document.getElementById('emEnglishBox');
    const englishTextDiv = document.getElementById('emEnglishText');
    const charCountDiv   = document.getElementById('emCharCount');

    const activeTabBtn = document.querySelector('.em-inner-tab-btn.active');
    const mode = activeTabBtn ? activeTabBtn.dataset.emTab : 'request';

    let payload = { language: emLanguageSelect.value, mode };

    if (mode === 'request') {
      const selectedTemplates = Array.from(
        document.querySelectorAll('input[name="emTemplates"]:checked')
      ).map(cb => cb.value);
      const link       = document.getElementById('emLink').value.trim();
      const customNote = emUseNote?.checked ? document.getElementById('emCustomNote').value.trim() : '';
      const useWrapper = document.getElementById('emUseWrapper').checked;

      if (!selectedTemplates.length && !customNote) {
        alert('Please select at least one template or add a custom note.');
        return;
      }
      payload = { ...payload, selectedTemplates, link, customNote, useWrapper };

    } else {
      const draftText = document.getElementById('emDraftText').value.trim();
      const tone      = document.querySelector('input[name="emTone"]:checked')?.value || 'neutral';

      if (!draftText) {
        alert('Please enter your message to draft or polish.');
        return;
      }
      payload = { ...payload, draftText, tone };
    }

    btn.disabled            = true;
    btn.innerHTML           = '⏳ Generating...';
    resultBox.style.display = 'none';

    try {
      const response = await fetch('/api/generate-email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const data = await response.json();

      if (data.success) {
        outputText.value = data.email;
        const wordCount  = data.email.trim().split(/\s+/).length;
        const charCount  = data.email.length;
        charCountDiv.textContent = `${wordCount} words · ${charCount} characters`;

        if (data.englishTranslation) {
          englishTextDiv.textContent = data.englishTranslation;
          englishBox.style.display   = 'block';
        } else {
          englishBox.style.display = 'none';
        }
        resultBox.style.display = 'block';

        document.querySelectorAll('input[name="emTemplates"]').forEach(cb => cb.checked = false);
        document.getElementById('emLink').value = '';
        if (emUseNote) { emUseNote.checked = false; emNoteArea.style.display = 'none'; }
        document.getElementById('emCustomNote').value = '';
        document.getElementById('emDraftText').value = '';
        const wrapperCb = document.getElementById('emUseWrapper');
        if (wrapperCb) wrapperCb.checked = true;
      } else {
        alert('Error generating content: ' + (data.message || 'Server error'));
      }
    } catch (err) {
      console.error(err);
      alert('Network error while generating content.');
    } finally {
      btn.disabled  = false;
      btn.innerHTML = '✨ Generate';
    }
  });

  document.getElementById('emCopyBtn').addEventListener('click', () => {
    const text    = document.getElementById('emOutputText');
    text.select();
    document.execCommand('copy');
    const btn     = document.getElementById('emCopyBtn');
    btn.innerHTML = '✅ Copied!';
    setTimeout(() => { btn.innerHTML = '📋 Copy'; }, 2000);
  });

  const copyEnglishBtn = document.getElementById('emCopyEnglishBtn');
  if (copyEnglishBtn) {
    copyEnglishBtn.addEventListener('click', () => {
      const englishText = document.getElementById('emEnglishText').textContent;
      navigator.clipboard.writeText(englishText).then(() => {
        copyEnglishBtn.innerHTML = '✅ Copied!';
        setTimeout(() => { copyEnglishBtn.innerHTML = '📋 Copy English'; }, 2000);
      }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard');
      });
    });
  }

  // ---------------------------------------------------------------------------
  // COLLAPSIBLE TOOLKIT CARDS
  // ---------------------------------------------------------------------------
  document.querySelectorAll('#toolkit .tk-header').forEach(header => {
    header.addEventListener('click', () => {
      header.closest('.ts-card').classList.toggle('tk-collapsed');
    });
  });

  // ---------------------------------------------------------------------------
  // ANNOUNCEMENTS
  // ---------------------------------------------------------------------------

  const ANN_COLORS = [
    '#4f8ef7','#e67e22','#2ecc71','#9b59b6','#e74c3c',
    '#1abc9c','#f39c12','#3498db','#e91e63','#607d8b',
  ];

  function annSubjectColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return ANN_COLORS[hash % ANN_COLORS.length];
  }

  function annDateLabel(dateStr) {
    const today = new Date();
    const d     = new Date(dateStr + 'T00:00:00');
    const diff  = Math.floor((new Date(today.toDateString()) - new Date(d.toDateString())) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff <= 7)  return 'This Week';
    return 'Earlier';
  }

  function annFormatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  let annAllData      = [];
  let annActiveSubject = 'All';

  function annRefresh() {
    const subjects = [...new Set(annAllData.map(a => a.subject))].sort();
    annRenderChips(subjects);
    annRenderTimeline(annAllData, annActiveSubject);
  }

  function annRenderChips(subjects) {
    const container = document.getElementById('ann-subject-chips');
    const all       = ['All', ...subjects];
    container.innerHTML = all.map(s => {
      const active = s === annActiveSubject ? ' active' : '';
      return `<button class="ann-chip${active}" data-subject="${s}">${s}</button>`;
    }).join('');
  }

  function annRenderTimeline(data, subjectFilter) {
    const listEl = document.getElementById('ann-list');
    let filtered = subjectFilter && subjectFilter !== 'All'
      ? data.filter(a => a.subject === subjectFilter)
      : data;

    if (!filtered.length) {
      listEl.innerHTML = '<div class="ann-empty">No announcements found.</div>';
      return;
    }

    const groups = {};
    const ORDER  = ['Today', 'Yesterday', 'This Week', 'Earlier'];
    filtered.forEach(a => {
      const label = annDateLabel(a.date);
      if (!groups[label]) groups[label] = [];
      groups[label].push(a);
    });

    listEl.innerHTML = ORDER.filter(g => groups[g]).map(groupLabel => {
      const cards = groups[groupLabel].map(a => {
        const id    = a._id;
        const color = annSubjectColor(a.subject);
        const imagesHtml = a.images && a.images.length
          ? `<div class="ann-images">${a.images.map(src =>
              `<img class="ann-image" src="${src}" alt="" loading="lazy">`
            ).join('')}</div>`
          : '';
        return `
          <div class="ann-card" data-id="${id}">
            <div class="ann-card-header">
              <span class="ann-channel-badge" style="background:${color};">${escHtml(a.subject)}</span>
              <span class="ann-announcer">${escHtml(a.announcer)}</span>
              <span class="ann-date-pill">${annFormatDate(a.date)}</span>
              <button class="ann-delete-btn" data-id="${id}" title="Delete">✕</button>
            </div>
            <div class="ann-content">${a.content}</div>
            ${imagesHtml}
          </div>`;
      }).join('');
      return `<div class="ann-date-group"><div class="ann-date-header">${groupLabel}</div>${cards}</div>`;
    }).join('');
  }

  function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  async function annLoad() {
    try {
      const res  = await fetch('/api/tools/announcements');
      const data = await res.json();
      if (!data.success) return;
      annAllData = data.announcements;
      annRefresh();
    } catch (e) {
      document.getElementById('ann-list').innerHTML = '<div class="ann-empty">Failed to load announcements.</div>';
    }
  }

  document.getElementById('ann-submit-btn').addEventListener('click', async () => {
    const announcer = document.getElementById('ann-announcer').value.trim();
    const date      = document.getElementById('ann-date').value;
    const subject   = document.getElementById('ann-subject').value.trim();
    const content   = document.getElementById('ann-content').value.trim();
    if (!announcer || !date || !subject || !content) {
      alert('Please fill in all fields.');
      return;
    }
    const btn = document.getElementById('ann-submit-btn');
    btn.disabled    = true;
    btn.textContent = 'Saving...';
    try {
      const formData = new FormData();
      formData.append('announcer', announcer);
      formData.append('date', date);
      formData.append('subject', subject);
      formData.append('content', content);
      const files = document.getElementById('ann-images').files;
      for (const file of files) formData.append('images', file);

      const res  = await fetch('/api/tools/announcements', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        document.getElementById('ann-announcer').value = '';
        document.getElementById('ann-date').value      = '';
        document.getElementById('ann-subject').value   = '';
        document.getElementById('ann-content').value   = '';
        document.getElementById('ann-images').value    = '';
        // Insert at front (newest first) and re-render immediately — no second fetch
        annAllData.unshift(data.announcement);
        annRefresh();
      } else {
        alert(data.error || 'Failed to save.');
      }
    } catch (e) {
      alert('Network error.');
    } finally {
      btn.disabled    = false;
      btn.textContent = '➕ Add Announcement';
    }
  });

  document.getElementById('ann-subject-chips').addEventListener('click', e => {
    if (!e.target.classList.contains('ann-chip')) return;
    annActiveSubject = e.target.dataset.subject;
    annRefresh();
  });

  document.getElementById('ann-list').addEventListener('click', async e => {
    const btn = e.target.closest('.ann-delete-btn');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!confirm('Delete this announcement?')) return;
    try {
      await fetch(`/api/tools/announcements/${id}`, { method: 'DELETE' });
      annAllData = annAllData.filter(a => a._id !== id);
      annRefresh();
    } catch (e) {
      alert('Failed to delete.');
    }
  });

  // Ask AI
  const annAnswerBox = document.getElementById('ann-answer-box');

  async function annAsk() {
    const question = document.getElementById('ann-question').value.trim();
    if (!question) return;
    const btn = document.getElementById('ann-ask-btn');
    btn.disabled    = true;
    btn.textContent = 'Thinking...';
    annAnswerBox.className = 'ann-answer-box visible';
    annAnswerBox.innerHTML = `
      <div class="ann-answer-label">AI Answer</div>
      <div class="ann-answer-question">${escHtml(question)}</div>
      <div class="ann-answer-loading">Searching through announcements...</div>`;
    try {
      const res  = await fetch('/api/tools/announcements/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      annAnswerBox.innerHTML = `
        <div class="ann-answer-label">AI Answer</div>
        <div class="ann-answer-question">${escHtml(question)}</div>
        <div class="ann-answer-text">${data.answer || 'No answer returned.'}</div>`;
    } catch (err) {
      annAnswerBox.innerHTML = `
        <div class="ann-answer-label">AI Answer</div>
        <div class="ann-answer-text" style="color:#ef4444;">Failed to get an answer. Please try again.</div>`;
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Ask AI';
    }
  }

  document.getElementById('ann-ask-btn').addEventListener('click', annAsk);
  document.getElementById('ann-question').addEventListener('keydown', e => {
    if (e.key === 'Enter') annAsk();
  });

  annLoad();
});