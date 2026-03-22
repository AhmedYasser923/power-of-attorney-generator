document.addEventListener('DOMContentLoaded', () => {
    const ticketDropZone = document.getElementById('ticketDropZone');
    const ticketInput = document.getElementById('ticketInput');
    const previewTicket = document.getElementById('previewTicketContainer');
    const ticketName = document.getElementById('ticketNameDisplay');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const clearBtn = document.getElementById('clearFilesBtn');
    const resultsCard = document.getElementById('resultsCard');
    
    let currentFiles = [];
    let backgroundAnalysisPromise = null;
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

    function triggerBackgroundAnalysis() {
    if (currentFiles.length === 0) return;

    if (fetchAbortController) {
        fetchAbortController.abort();
    }
    fetchAbortController = new AbortController();

    const formData = new FormData();
    currentFiles.forEach(file => formData.append('ticket', file));

    backgroundAnalysisPromise = fetch('/api/analyze-ticket', { 
        method: 'POST', 
        body: formData,
        signal: fetchAbortController.signal
    })
    .then(async (res) => {
        if (!res.ok) throw new Error('Analysis failed');
        return await res.json();
    })
    .catch(err => {
        if (err.name === 'AbortError') {
            console.log('Previous background task cancelled due to new file upload.');
        } else {
            throw err;
        }
    });
    }

    function handleFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    currentFiles = [...currentFiles, ...Array.from(fileList)];
    updateUI();
    triggerBackgroundAnalysis(); 
    }

    clearBtn.addEventListener('click', () => { 
        currentFiles = []; 
        ticketInput.value = ""; 
        if (fetchAbortController) fetchAbortController.abort(); 
        backgroundAnalysisPromise = null;
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
        triggerBackgroundAnalysis(); 
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

    try {
        if (!backgroundAnalysisPromise) {
            triggerBackgroundAnalysis(); 
        }
        
        let rawResponse = await backgroundAnalysisPromise;
        let dataArray = rawResponse.journeys || rawResponse; 
        
        if (!Array.isArray(dataArray)) dataArray = [dataArray];

        resultsCard.innerHTML = '';

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
        
        let showPassengerCard = true;
        if (journeyIndex > 0) {
            const prevData = dataArray[journeyIndex - 1];
            if (data.pnr === prevData.pnr && data.passengerName === prevData.passengerName) {
            showPassengerCard = false;
            }
        }

        if (showPassengerCard) {
            let pnrNoteHtml = '';
            if (data.pnrNote) {
            pnrNoteHtml = `<div style="margin-top: 10px; font-size: 11px; color: #0284c7; background: #e0f2fe; padding: 6px 10px; border-radius: 6px; max-width: 240px; text-align: right; line-height: 1.3; font-weight: 600;">${data.pnrNote}</div>`;
            }

            journeyWrapper.innerHTML += `
            <div class="passenger-card">
                <div style="flex: 1;">
                <div class="p-label">Passenger Name</div>
                <div class="p-value" style="margin-bottom: 12px;">${data.passengerName || 'Not Found'}</div>
                
                <div class="p-label">Ticket Number</div>
                <div class="p-value" style="font-size: 16px; font-family: monospace; color: var(--secondary);">${data.ticketNumber || 'Not Provided'}</div>
                </div>
                <div class="pnr-box" style="display: flex; flex-direction: column; justify-content: center; align-items: flex-end;">
                <div class="p-label">PNR / Booking Ref</div>
                <div class="p-value">${data.pnr || 'Not Found'}</div>
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
                let airText = '';

                if (marketing === operating) {
                    airText = `✈️ Operated by: ${operating}`;
                } else {
                    airText = `✈️ Booked: ${marketing} <span style="color:var(--primary); margin-left:8px;">| Operated by: ${operating}</span>`;
                }
                
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

                let distanceHtml = '';
                if (flight.distanceKm) {
                    distanceHtml = `<div style="position: absolute; top: -20px; font-size: 10px; font-weight: 700; color: var(--text-muted); background: var(--surface); padding: 2px 8px; border-radius: 10px; border: 1px solid var(--border-soft); z-index: 3; letter-spacing: 0.5px;">${flight.distanceKm}</div>`;
                }

                let docsHtml = '';
                if (flight.claimDocuments) {
                    let isDefault = flight.claimDocuments === 'No documents required';
                    let docIcon = isDefault ? '📄' : '📑 Required:';
                    let docColor = isDefault ? 'var(--text-muted)' : '#0369a1';
                    let docBg = isDefault ? 'transparent' : '#f0f9ff';
                    let docBorder = isDefault ? '1px dashed #cbd5e1' : '1px solid #bae6fd';
                    
                    docsHtml = `<div style="position: absolute; bottom: -32px; left: 50%; transform: translateX(-50%); width: max-content; max-width: 250px; font-size: 10px; font-weight: 700; color: ${docColor}; background: ${docBg}; border: ${docBorder}; padding: 4px 10px; border-radius: 8px; text-align: center; line-height: 1.3; z-index: 4; box-shadow: ${isDefault ? 'none' : '0 2px 4px rgba(0,0,0,0.05)'};">${docIcon} ${flight.claimDocuments}</div>`;
                }

                let statusBtnHtml = '';
                if (flight.flightNumber && flight.flightNumber !== 'N/A' && flight.flightNumber !== 'Unknown') {
                    statusBtnHtml = `<button type="button" class="btn-check-status" data-flight="${flight.flightNumber}" data-date="${flight.date || 'Unknown'}" data-dest="${flight.destinationIata || ''}" style="background: #f1f5f9; color: #0f172a; border: 1px solid #cbd5e1; border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 5px;">📡 AI Analysis</button>`;
                }

                let eocBtnHtml = '';
                if (flight.date && flight.date !== 'Unknown') {
                    eocBtnHtml = `<button type="button" class="btn-check-eoc" data-date="${flight.date}" data-oiata="${flight.originIata || ''}" data-diata="${flight.destinationIata || ''}" data-ocountry="${flight.originCountry || ''}" data-dcountry="${flight.destinationCountry || ''}" style="background: #fef08a; color: #9a3412; border: 1px solid #fde047; border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 5px;">⚠️ Check EOC</button>`;
                }

                flightCardsContainer.innerHTML += `
                    <div class="flight-card" style="opacity: ${opacityStyle};">
                    ${statusWarningHtml}
                    <div class="fc-top"><div class="fc-airline">${airText}</div><div class="fc-badge">${legIndicator}</div></div>
                    <div class="fc-path-container">
                        <div class="fc-node left">
                            <div class="fc-iata">${flight.originIata || '???'}</div>
                            <div class="fc-airport">${flight.originName || ''}</div>
                            <div class="fc-city">${flight.originCity || ''}, ${flight.originCountry || ''}</div>
                            ${originStatute}
                            <div class="fc-time">${flight.departureTime || '--:--'}</div>
                        </div>
                        <div class="fc-line-wrapper">
                        ${distanceHtml}
                        <div class="fc-line"></div>
                        <div class="fc-plane">✈</div>
                        ${docsHtml}
                        </div>
                        <div class="fc-node right">
                            <div class="fc-iata">${flight.destinationIata || '???'}</div>
                            <div class="fc-airport">${flight.destinationName || ''}</div>
                            <div class="fc-city">${flight.destinationCity || ''}, ${flight.destinationCountry || ''}</div>
                            ${destStatute}
                            <div class="fc-time">${flight.arrivalTime || '--:--'}</div>
                        </div>
                    </div>
                    <div class="fc-bottom">
                        <div style="display: flex; align-items: center; gap: 15px;">
                        <div>📅 ${flight.date || 'Unknown'}</div>
                        <div class="fc-flight-num" style="display: flex; gap: 8px; align-items: center;">Flight: ${flight.flightNumber || 'N/A'} ${statusBtnHtml} ${eocBtnHtml}</div>
                        </div>
                        <div style="display: flex; gap: 10px; align-items: center;">
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

    /* --- EOC CHECKER UI LOGIC (WITH BEAUTIFUL WARNING BOX) --- */
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

    /* --- AI-POWERED BEAUTIFUL DASHBOARD RENDERING --- */
    resultsCard.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-check-status');
    if (!btn) return;

    const flightCard = btn.closest('.flight-card');
    const flightNum = btn.dataset.flight;
    const date = btn.dataset.date;
    const dest = btn.dataset.dest;

    const originalHtml = btn.innerHTML;
    btn.innerHTML = '⏳ AI Thinking...';
    btn.disabled = true;

    try {
        const response = await fetch(`/api/flight-status?flightNumber=${encodeURIComponent(flightNum)}&date=${encodeURIComponent(date)}&destination=${encodeURIComponent(dest)}`);
        const data = await response.json();

        if (data.aiStats) {
        const ai = data.aiStats;

        const statsCard = document.createElement('div');
        statsCard.style.cssText = "margin-top: 20px; border-radius: 8px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); font-family: sans-serif; animation: fadeIn 0.4s ease;";
        
        statsCard.innerHTML = `
            <div style="background: ${ai.bannerBg}; color: ${ai.bannerTextCol}; text-align: center; padding: 12px; font-size: 18px; font-weight: 600; letter-spacing: 0.5px;">
                ${ai.bannerText}
            </div>
            <div style="display: flex; background: #1e293b; color: #ffffff;">
                <div style="flex: 1; border-right: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column;">
                    <div style="background: rgba(255,255,255,0.05); text-align: center; padding: 15px; font-size: 22px; font-weight: 300;">Departure</div>
                    <div style="padding: 20px; text-align: center; flex: 1; display: flex; flex-direction: column; justify-content: center;">
                        <div style="font-size: 42px; font-weight: 600; line-height: 1;">${ai.depIata}</div>
                        <div style="font-size: 13px; color: #94a3b8; margin-top: 5px; height: 35px;">${ai.depCity}</div>
                        
                        <div style="margin-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 20px;">
                            <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Flight Gate Times</div>
                            <div style="font-size: 13px; color: #cbd5e1; margin-top: 2px;">${ai.depDate}</div>
                        </div>
                        
                        <div style="display: flex; justify-content: space-around; margin-top: 20px;">
                            <div>
                                <div style="font-size: 12px; color: #e2e8f0; margin-bottom: 4px;">Scheduled</div>
                                <div style="font-size: 26px; font-weight: 700; line-height: 1;">${ai.depSched} <span style="font-size: 12px; font-weight: 400; color: #94a3b8;">${ai.depSchedZone}</span></div>
                            </div>
                            <div>
                                <div style="font-size: 12px; color: #e2e8f0; margin-bottom: 4px;">${ai.depActualLabel}</div>
                                <div style="font-size: 26px; font-weight: 700; line-height: 1;">${ai.depActual} <span style="font-size: 12px; font-weight: 400; color: #94a3b8;">${ai.depActualZone}</span></div>
                            </div>
                        </div>
                        
                        <div style="margin-top: 25px; font-size: 13px; color: #cbd5e1;">Total Departure Delay: <span style="color: ${ai.depDelayColor}; font-weight: 700;">${ai.depDelay}</span></div>
                    </div>
                </div>

                <div style="flex: 1; display: flex; flex-direction: column;">
                    <div style="background: rgba(255,255,255,0.05); text-align: center; padding: 15px; font-size: 22px; font-weight: 300;">Arrival</div>
                    <div style="padding: 20px; text-align: center; flex: 1; display: flex; flex-direction: column; justify-content: center;">
                        <div style="font-size: 42px; font-weight: 600; line-height: 1;">${ai.arrIata}</div>
                        <div style="font-size: 13px; color: #94a3b8; margin-top: 5px; height: 35px;">${ai.arrCity}</div>
                        
                        <div style="margin-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 20px;">
                            <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Flight Gate Times</div>
                            <div style="font-size: 13px; color: #cbd5e1; margin-top: 2px;">${ai.arrDate}</div>
                        </div>
                        
                        <div style="display: flex; justify-content: space-around; margin-top: 20px;">
                            <div>
                                <div style="font-size: 12px; color: #e2e8f0; margin-bottom: 4px;">Scheduled</div>
                                <div style="font-size: 26px; font-weight: 700; line-height: 1;">${ai.arrSched} <span style="font-size: 12px; font-weight: 400; color: #94a3b8;">${ai.arrSchedZone}</span></div>
                            </div>
                            <div>
                                <div style="font-size: 12px; color: #e2e8f0; margin-bottom: 4px;">${ai.arrActualLabel}</div>
                                <div style="font-size: 26px; font-weight: 700; line-height: 1;">${ai.arrActual} <span style="font-size: 12px; font-weight: 400; color: #94a3b8;">${ai.arrActualZone}</span></div>
                            </div>
                        </div>
                        
                        <div style="margin-top: 25px; font-size: 13px; color: #cbd5e1;">Total Arrival Delay: <span style="color: ${ai.arrDelayColor}; font-weight: 700;">${ai.arrDelay}</span></div>
                    </div>
                </div>
            </div>
        `;
        
        flightCard.appendChild(statsCard);

        if (ai.summaryHTML) {
            const summaryBox = document.createElement('div');
            summaryBox.style.cssText = "margin-top: 12px; background: #ffffff; border: 1px solid #cbd5e1; border-left: 4px solid #2563eb; padding: 16px; border-radius: 8px; font-size: 13px; color: #334155; line-height: 1.5; animation: fadeIn 0.5s ease;";
            summaryBox.innerHTML = `<div style="font-weight: 800; color: #0f172a; margin-bottom: 8px; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">🤖 AI Flight Analysis</div>${ai.summaryHTML}`;
            flightCard.appendChild(summaryBox);
        }

        btn.outerHTML = `<div style="background: #e2e8f0; color: #475569; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700;">✨ AI Analyzed</div>`;
        
        } else {
        btn.outerHTML = `<div style="background: #fef2f2; color: #991b1b; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; border: 1px solid #fecaca;">⚠️ ${data.error || 'Data Unavailable'}</div>`;
        }
    } catch(err) {
        console.error(err);
        btn.innerHTML = '❌ Error';
        btn.disabled = false;
    }
    });
    
});