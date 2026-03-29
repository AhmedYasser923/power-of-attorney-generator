document.addEventListener('DOMContentLoaded', () => {
    const ticketDropZone = document.getElementById('ticketDropZone');
    const ticketInput = document.getElementById('ticketInput');
    const previewTicket = document.getElementById('previewTicketContainer');
    const ticketName = document.getElementById('ticketNameDisplay');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const clearBtn = document.getElementById('clearFilesBtn');
    const resultsCard = document.getElementById('resultsCard');
    
    let currentFiles = [];
    let fetchAbortController = null;

    function updateUI() {
        if (currentFiles.length === 0) {
            previewTicket.style.display = 'none';
            resultsCard.style.display = 'none';
            return;
        }
        ticketName.innerText = currentFiles.length === 1 ? `📄 1 File Ready: ${currentFiles[0].name}` : `📄 ${currentFiles.length} Files Ready`;
        previewTicket.style.display = 'block';
    }

    function handleFiles(fileList) {
        if (!fileList || fileList.length === 0) return;
        currentFiles = [...currentFiles, ...Array.from(fileList)];
        updateUI();
    }

    clearBtn.addEventListener('click', () => { 
        currentFiles = []; 
        ticketInput.value = ""; 
        if (fetchAbortController) fetchAbortController.abort(); 
        updateUI(); 
    });

    ticketDropZone.addEventListener('click', () => { ticketInput.click(); });
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
        for (let item of clipboard.items) {
            if (item.type.startsWith('image/') || item.type === 'application/pdf') {
                const file = item.getAsFile();
                const ext = file.type.split('/')[1] || 'png';
                pastedFiles.push(new File([file], `Pasted_Document_${Date.now()}.${ext}`, { type: file.type }));
            }
        }
        
        if (pastedFiles.length > 0) {
            currentFiles = [...currentFiles, ...pastedFiles];
            updateUI();
        }
    });

    analyzeBtn.addEventListener('click', async () => {
        if (currentFiles.length === 0) return;
        
        const originalText = analyzeBtn.innerHTML;
        analyzeBtn.disabled = true;

        const startTime = Date.now();
        analyzeBtn.innerHTML = `<span class="stopwatch-icon">⏳</span> Analyzing... <span id="liveTimer" style="font-family: monospace; font-size: 18px; margin-left: 5px;">0.0s</span>`;
        const liveTimerEl = document.getElementById('liveTimer');
        
        const timerInterval = setInterval(() => {
            if (liveTimerEl) {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                liveTimerEl.innerText = `${elapsed}s`;
            }
        }, 100);

        if (fetchAbortController) {
            fetchAbortController.abort();
        }
        fetchAbortController = new AbortController();

        const formData = new FormData();
        currentFiles.forEach(file => formData.append('ticket', file));

        try {
            const res = await fetch('/api/analyze-ticket', { 
                method: 'POST', 
                body: formData,
                signal: fetchAbortController.signal
            });

            if (!res.ok) throw new Error('Analysis failed');

            let rawResponse = await res.json();

            resultsCard.innerHTML = '';
            resultsCard.style.display = 'block';

            if (rawResponse.noFlightData) {
                resultsCard.innerHTML = `
                    <div style="text-align: center; padding: 48px 24px; background: #fff7ed; border: 1px dashed #fed7aa; border-radius: 12px; color: #9a3412;">
                        <div style="font-size: 48px; margin-bottom: 16px;">🚫✈️</div>
                        <div style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">No Flight Information Found</div>
                        <div style="font-size: 14px; color: #c2410c;">This document doesn't contain any flight information.<br>Please upload a boarding pass, e-ticket, or itinerary.</div>
                    </div>`;
                return;
            }

            let dataArray = rawResponse.journeys || rawResponse;
            if (!Array.isArray(dataArray)) dataArray = [dataArray];

            if (rawResponse.processingTime) {
                resultsCard.innerHTML += `<div style="display: flex; justify-content: flex-end; margin-bottom: 15px;"><span style="background: #e2e8f0; color: #475569; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">⏱️ Server Processed in ${rawResponse.processingTime}s</span></div>`;
            }

            dataArray.forEach((data, journeyIndex) => {
                const journeyWrapper = document.createElement('div');
                journeyWrapper.style.marginBottom = "60px";
                journeyWrapper.style.borderBottom = journeyIndex < dataArray.length - 1 ? "3px dashed var(--border-soft)" : "none";
                journeyWrapper.style.paddingBottom = journeyIndex < dataArray.length - 1 ? "40px" : "0";

                if (dataArray.length > 1) {
                    journeyWrapper.innerHTML += `<h3 style="color: var(--primary); border-bottom: 1px solid var(--border-soft); padding-bottom: 10px;">🎫 Ticket / Journey ${journeyIndex + 1}</h3>`;
                }

                if (data.ec261) {
                    const isEligible = data.ec261.status && data.ec261.status.toLowerCase().includes('not') === false;
                    const cardClass = isEligible ? 'eligible' : 'not-eligible';
                    const icon = isEligible ? '🛡️' : '⚠️';

                    journeyWrapper.innerHTML += `
                        <div class="ec261-card ${cardClass}">
                            <div class="ec-icon">${icon}</div>
                            <div class="ec-content">
                                <h4 class="ec-title">OVERALL CLAIM: ${data.ec261.status.toUpperCase()}</h4>
                                <p class="ec-reason">${data.ec261.reason}</p>
                            </div>
                        </div>`;
                }
                
                // --- NEW PASSENGER & TICKET MAPPING UI ---
                let showPassengerCard = true;
                if (journeyIndex > 0) {
                    const prevData = dataArray[journeyIndex - 1];
                    if (data.pnr === prevData.pnr) {
                        showPassengerCard = false; // Don't duplicate passenger blocks for same PNR round-trips
                    }
                }

                if (showPassengerCard) {
                    let pnrNoteHtml = '';
                    if (data.pnrNote) {
                        pnrNoteHtml = `<div style="margin-top: 10px; font-size: 11px; color: #0284c7; background: #e0f2fe; padding: 6px 10px; border-radius: 6px; max-width: 240px; text-align: right; line-height: 1.3; font-weight: 600;">${data.pnrNote}</div>`;
                    }

                    // Map through all passengers dynamically
                    let passengersListHtml = '';
                    if (data.passengers && data.passengers.length > 0) {
                        passengersListHtml = data.passengers.map(p => `
                            <div style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; padding: 10px 14px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 8px;">
                                <span style="font-weight: 700; color: var(--text-main); font-size: 15px;">${p.firstName || ''} ${p.lastName || ''}</span>
                                <span style="font-family: monospace; color: var(--primary); font-weight: 600; background: #e0f2fe; padding: 4px 8px; border-radius: 6px; font-size: 13px; letter-spacing: 1px;">🎟️ ${p.ticketNumber || 'No Ticket #'}</span>
                            </div>
                        `).join('');
                    } else {
                        // Fallback for missing data
                        passengersListHtml = `<div style="color: var(--text-muted); font-size: 14px;">No passenger data extracted.</div>`;
                    }

                    journeyWrapper.innerHTML += `
                        <div class="passenger-card" style="align-items: stretch;">
                            <div style="flex: 1.5; padding-right: 20px; border-right: 1px dashed var(--border-soft);">
                                <div class="p-label" style="margin-bottom: 12px;">Passenger Roster & Tickets</div>
                                ${passengersListHtml}
                            </div>
                            <div class="pnr-box" style="flex: 1; margin-left: 20px; display: flex; flex-direction: column; justify-content: center; align-items: flex-end;">
                                <div class="p-label">PNR / Booking Ref</div>
                                <div class="p-value" style="font-size: 20px;">${data.pnr || 'Not Found'}</div>
                                ${pnrNoteHtml}
                            </div>
                        </div>
                    `;
                }
                
                const flightCardsContainer = document.createElement('div');
                
                if (data.routes && data.routes.length > 0) {
                    data.routes.forEach((route) => {
                        flightCardsContainer.innerHTML += `<div class="route-header">${route.type || 'Flight Route'}</div>`;
                        
                        if (route.legs && route.legs.length > 0) {
                            route.legs.forEach((flight, index) => {
                                const legIndicator = route.legs.length > 1 ? `Leg ${index + 1}` : 'Direct';
                  
                                let legBadgeHtml = '';
                                if (flight.ec261Leg && flight.ec261Leg.status) {
                                    const lEl = !flight.ec261Leg.status.toLowerCase().includes('not');
                                    legBadgeHtml = `<div class="fc-ec-badge ${lEl ? 'eligible' : 'not-eligible'}" title="${flight.ec261Leg.reason}">${lEl ? '✅' : '❌'} ${flight.ec261Leg.status}</div>`;
                                    
                                    if (lEl && flight.ec261Leg.estimatedClaimValue && flight.ec261Leg.estimatedClaimValue !== 'N/A') {
                                        legBadgeHtml += `<div class="leg-claim-value">💸 ${flight.ec261Leg.estimatedClaimValue}</div>`;
                                    }
                                }

                                let expBadgeHtml = '';
                                let originStatute = '';
                                let destStatute = '';
                                if (flight.ec261Leg && flight.ec261Leg.claimExpiration) {
                                    const exp = flight.ec261Leg.claimExpiration;
                                    if (exp.originYears) originStatute = `<div style="font-size: 10px; color: #3b82f6; font-weight: 700; margin-top: 4px;">⚖️ Limit: ${exp.originYears}</div>`;
                                    if (exp.destinationYears) destStatute = `<div style="font-size: 10px; color: #3b82f6; font-weight: 700; margin-top: 4px;">⚖️ Limit: ${exp.destinationYears}</div>`;

                                    if (exp.isExpired) {
                                        expBadgeHtml = `<div class="fc-exp-badge expired" title="Deadline was ${exp.expirationDate} (${exp.bestCountry})">🚨 EXPIRED</div>`;
                                    } else {
                                        expBadgeHtml = `<div class="fc-exp-badge" title="Valid under ${exp.bestCountry} law (${exp.bestYears} years)">⏳ Valid to ${exp.expirationDate}</div>`;
                                    }
                                }

                                let marketing = flight.marketingAirline || 'Unknown';
                                let operating = flight.operatingAirline || marketing;
                                let airText = marketing === operating 
                                    ? `✈️ Operated by: ${operating}` 
                                    : `✈️ Booked: ${marketing} <span style="color:var(--primary); margin-left:8px;">| Operated by: ${operating}</span>`;
                                
                                let statusWarningHtml = '';
                                let opacityStyle = '1';
                                
                                if (flight.flightStatus) {
                                    const statusLower = flight.flightStatus.toLowerCase();
                                    if (statusLower.includes('cancel')) {
                                        statusWarningHtml = `<div style="background: #fee2e2; color: #dc2626; padding: 6px 12px; border-radius: 6px; font-weight: 800; font-size: 12px; margin-bottom: 16px; display: inline-block; border: 1px solid #fecaca;">⚠️ FLIGHT CANCELLED</div>`;
                                        opacityStyle = '0.55'; 
                                    } else if (statusLower.includes('review') || statusLower.includes('change') || statusLower.includes('rebook')) {
                                        statusWarningHtml = `<div style="background: #ffedd5; color: #c2410c; padding: 6px 12px; border-radius: 6px; font-weight: 800; font-size: 12px; margin-bottom: 16px; display: inline-block; border: 1px solid #fed7aa;">🔄 SCHEDULE CHANGE / REVIEW TIMELINE</div>`;
                                    }
                                }

                                let distanceHtml = flight.distanceKm ? `<div style="position: absolute; top: -20px; font-size: 10px; font-weight: 700; color: var(--text-muted); background: var(--surface); padding: 2px 8px; border-radius: 10px; border: 1px solid var(--border-soft); z-index: 3; letter-spacing: 0.5px;">${flight.distanceKm}</div>` : '';


                                let docsHtml = '';
                                if (flight.claimDocuments && Array.isArray(flight.claimDocuments)) {
                                    const docsItemsHtml = flight.claimDocuments.map(doc => {
                                        const isDefault = doc.reqs === 'No documents required';
                                        const docIcon = isDefault ? '📄' : '📑';
                                        const docColor = isDefault ? 'var(--text-muted)' : '#0369a1';
                                        const docBg   = isDefault ? 'transparent' : '#f0f9ff';
                                        const docBorder = isDefault ? '1px dashed #cbd5e1' : '1px solid #bae6fd';
                                        
                                        const rolePrefix = doc.role ? `[${doc.role}] ` : '';
                                        const docLabel = isDefault 
                                            ? `<b>${rolePrefix}${doc.airline}</b>: No docs required` 
                                            : `<b>${rolePrefix}${doc.airline}</b> Required: ${doc.reqs}`;
                                        
                                        return `<div style="display:flex;align-items:flex-start;gap:6px;color:${docColor};background:${docBg};border:${docBorder};padding:6px 10px;border-radius:6px;font-size:11px;margin-top:4px;width:100%;"><span style="flex-shrink:0;margin-top:2px;">${docIcon}</span> <span style="white-space:normal;line-height:1.4;">${docLabel}</span></div>`;
                                    }).join('');
                                    
                                    docsHtml = `<div style="width:100%; display:flex; flex-direction:column; margin-top:8px;">${docsItemsHtml}</div>`;
                                }
                             

                                // --- NEW MULTI-FLIGHT NUMBER LOGIC ---
                                let statusBtnsHtml = '';
                                let flightNumsDisplay = '';
                                const fNums = Array.isArray(flight.flightNumbers) ? flight.flightNumbers : [];

                                if (fNums.length > 0) {
                                    flightNumsDisplay = fNums.join(' <span style="color:#cbd5e1; font-weight:400; margin:0 4px;">/</span> ');
                                    fNums.forEach(fNum => {
                                        const cleanNum = fNum.trim();
                                        if(cleanNum && cleanNum !== 'N/A' && cleanNum !== 'Unknown') {
                                            statusBtnsHtml += `<button type="button" class="btn-check-status" data-flight="${cleanNum}" data-date="${flight.date || 'Unknown'}" data-dest="${flight.destinationIata || ''}" style="margin-left: 6px; background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1;border-radius:6px;padding:3px 9px;font-size:11px;font-weight:700;cursor:pointer;transition:0.2s;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;">📡 ${cleanNum} Stats</button>`;
                                        }
                                    });
                                } else {
                                    flightNumsDisplay = 'N/A';
                                }

                                let eocBtnHtml = '';
                                if (flight.date && flight.date !== 'Unknown') {
                                    eocBtnHtml = `<button type="button" class="btn-check-eoc" data-date="${flight.date}" data-oiata="${flight.originIata || ''}" data-diata="${flight.destinationIata || ''}" data-ocountry="${flight.originCountry || ''}" data-dcountry="${flight.destinationCountry || ''}" style="background:#fef08a;color:#9a3412;border:1px solid #fde047;border-radius:6px;padding:5px 12px;font-size:12px;font-weight:700;cursor:pointer;transition:0.2s;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;">⚠️ Check EOC</button>`;
                                }

                                flightCardsContainer.innerHTML += `
                                    <div class="flight-card" style="opacity:${opacityStyle};">

                                        ${statusWarningHtml}

                                        <div class="fc-top">
                                            <div class="fc-airline">${airText}</div>
                                            <div class="fc-badge">${legIndicator}</div>
                                        </div>

                                        <div class="fc-path-container">
                                            <div class="fc-node left">
                                                <div class="fc-iata">${flight.originIata || '???'}</div>
                                                <div class="fc-airport">${flight.originName || ''}</div>
                                                <div class="fc-city">${flight.originCity || ''}, ${flight.originCountry || ''}</div>
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
                                            </div>
                                        </div>

                                        <div class="fc-times-row">
                                            <div>
                                                <div class="fc-time">${flight.departureTime || '--:--'}</div>
                                                ${originStatute ? `<div class="fc-statute">${originStatute.replace(/<[^>]*>/g,'')}</div>` : ''}
                                            </div>
                                            <div style="text-align:right;">
                                                <div class="fc-time">${flight.arrivalTime || '--:--'}</div>
                                                ${destStatute ? `<div class="fc-statute" style="text-align:right;">${destStatute.replace(/<[^>]*>/g,'')}</div>` : ''}
                                            </div>
                                        </div>

                                        <div class="fc-info-strip" style="flex-wrap: wrap;">
                                            <span class="fc-date-pill">📅 ${flight.date || 'Unknown'}</span>
                                            <span class="fc-strip-sep">·</span>
                                            <span class="fc-flight-num" style="display:flex; align-items:center; flex-wrap:wrap;">✈ ${flightNumsDisplay} ${statusBtnsHtml}</span>
                                            ${docsHtml ? `<span class="fc-strip-sep" style="width:100%; height:1px; background:#e2e8f0; margin:4px 0;"></span>${docsHtml}` : ''}
                                        </div>

                                        <div class="fc-footer">
                                            <div style="display:flex;gap:8px;align-items:center;">
                                                ${eocBtnHtml}
                                            </div>
                                            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                                                ${legBadgeHtml}
                                                ${expBadgeHtml}
                                            </div>
                                        </div>

                                    </div>`;
                            });
                        } else {
                            flightCardsContainer.innerHTML += '<p style="color: var(--text-muted); font-size: 14px;">No leg data found for this route.</p>';
                        }
                    });
                } else {
                    flightCardsContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted); background: var(--surface); border-radius: var(--radius-md); border: 1px dashed var(--border-soft);">No flight routes detected.</div>';
                }

                journeyWrapper.appendChild(flightCardsContainer);
                resultsCard.appendChild(journeyWrapper);
            });

            resultsCard.style.display = 'block';
        } catch (error) {
            if (error.name !== 'AbortError') {
                alert('Failed to extract data. Ensure the images are clear.');
                console.error(error);
            }
        } finally {
            clearInterval(timerInterval);
            analyzeBtn.innerHTML = originalText;
            analyzeBtn.disabled = false;
        }
    });

    /* --- EOC CHECKER UI LOGIC --- */
    resultsCard.addEventListener('click', async (e) => {
        const eocBtn = e.target.closest('.btn-check-eoc');
        if (eocBtn) {
            const flightCard = eocBtn.closest('.flight-card');
            eocBtn.innerHTML = '⏳ Checking...';
            eocBtn.disabled = true;
            
            const { date, oiata, diata, ocountry, dcountry } = eocBtn.dataset;
            
            try {
                const res = await fetch(`/api/check-eoc?date=${encodeURIComponent(date)}&originIata=${encodeURIComponent(oiata)}&destIata=${encodeURIComponent(diata)}&originCountry=${encodeURIComponent(ocountry)}&destCountry=${encodeURIComponent(dcountry)}`);
                const data = await res.json();
                
                if (data.eocFound && data.events && data.events.length > 0) {
                    const ev = data.events[0]; 
                    eocBtn.outerHTML = `<div style="background: #fef2f2; color: #991b1b; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; border: 1px solid #fecaca;" title="Claim Invalidated by EOC">🚨 EOC Found</div>`;
                    const eocAlert = document.createElement('div');
                    eocAlert.style.cssText = "margin-top: 16px; background: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #ef4444; padding: 16px; border-radius: 8px; font-size: 13px; color: #7f1d1d; line-height: 1.6; animation: fadeIn 0.4s ease; box-shadow: 0 4px 6px -1px rgba(239, 68, 68, 0.1);";
                    eocAlert.innerHTML = `
                        <div style="font-weight: 800; color: #dc2626; margin-bottom: 8px; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
                            ⚠️ Extraordinary Circumstances Detected
                        </div>
                        <div style="color: #450a0a; display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; align-items: baseline;">
                            <strong style="color: #991b1b;">Category:</strong> <span>${ev.category}</span>
                            <strong style="color: #991b1b;">Event:</strong> <span>${ev.event}</span>
                            <strong style="color: #991b1b;">Location:</strong> <span>${ev.location}</span>
                            <strong style="color: #991b1b;">Decision:</strong> <span style="font-weight: 800; color: #dc2626;">${ev.decision}</span>
                        </div>
                    `;
                    flightCard.appendChild(eocAlert);
                } else {
                    eocBtn.outerHTML = `<div style="background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; border: 1px solid #bbf7d0;">✅ No EOC Found</div>`;
                }
            } catch(err) {
                console.error(err);
                eocBtn.innerHTML = '❌ Error';
                eocBtn.disabled = false;
            }
            return; 
        }
    });

    /* --- FLIGHTY-INSPIRED AI DASHBOARD --- */
    resultsCard.addEventListener('click', async (e) => {
        const btn = e.target.closest('.btn-check-status');
        if (!btn) return;

        const flightCard = btn.closest('.flight-card');
        const flightNum = btn.dataset.flight;
        const date = btn.dataset.date;
        const dest = btn.dataset.dest;

        const originalHtml = btn.innerHTML;
        btn.innerHTML = `⏳ ${flightNum} Thinking...`;
        btn.disabled = true;

        try {
            const response = await fetch(`/api/flight-status?flightNumber=${encodeURIComponent(flightNum)}&date=${encodeURIComponent(date)}&destination=${encodeURIComponent(dest)}`);
            const data = await response.json();

            if (data.aiStats) {
                const ai = data.aiStats;
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

                const aiCommentHtml = ai.aiComment
                    ? `<div style="margin-top:16px;background:#1e293b;border:1px solid #334155;border-left:3px solid #3b82f6;border-radius:8px;padding:12px 16px;font-size:13px;color:#94a3b8;font-style:italic;line-height:1.5;">💬 ${ai.aiComment}</div>`
                    : '';

                const statsCard = document.createElement('div');
                statsCard.style.cssText = "margin-top: 20px; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; animation: fadeIn 0.4s ease;";

                statsCard.innerHTML = `
                    <div style="background:${ai.bannerBg};color:${ai.bannerTextCol};text-align:center;padding:14px;font-size:15px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;">
                        ${ai.bannerText} (${flightNum})
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

                        ${aiCommentHtml}
                    </div>
                `;

                // Append so multiple stats cards stack vertically if multiple buttons are clicked
                flightCard.appendChild(statsCard);

                // Disable only the clicked button so the other flight numbers can still be queried
                btn.outerHTML = `<div style="background: #e2e8f0; color: #475569; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; margin-left: 6px; display: inline-block;">✨ ${flightNum} checked</div>`;
                
            } else {
                btn.outerHTML = `<div style="background: #fef2f2; color: #991b1b; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; border: 1px solid #fecaca; margin-left: 6px; display: inline-block;">⚠️ ${flightNum} error</div>`;
            }
        } catch(err) {
            console.error(err);
            btn.innerHTML = '❌ Error';
            btn.disabled = false;
        }
    });
});