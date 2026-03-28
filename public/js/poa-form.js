document.addEventListener('DOMContentLoaded', () => {
    const selector = document.getElementById('templateSelector');
    const standardForm = document.getElementById('standardForm');
    const lufthansaForm = document.getElementById('lufthansaForm');
    const aerLingusForm = document.getElementById('aerLingusForm');
    const globalLogo = document.querySelector('img[src*="Screenshot_1"], img[src*="lufthansa_logo"], header img, .navbar img');
    
    let lufthansaDataTransfer = new DataTransfer();
    
    if (selector) {
      selector.addEventListener('change', (e) => {
        const val = e.target.value;
        
        [standardForm, lufthansaForm, aerLingusForm].forEach(f => {
          if(f) {
            f.style.display = 'none';
            f.querySelectorAll('input, textarea, select').forEach(el => el.disabled = true);
          }
        });

        if (val === 'standard') {
          standardForm.style.display = 'block';
          standardForm.querySelectorAll('input, textarea, select').forEach(el => el.disabled = false);
          if (globalLogo) { globalLogo.src = '/images/Screenshot_1.png'; globalLogo.style.height = '40px'; }
        } else if (val === 'lufthansa') {
          lufthansaForm.style.display = 'block';
          lufthansaForm.querySelectorAll('input, textarea, select').forEach(el => el.disabled = false);
          if (globalLogo) { globalLogo.src = '/images/Lufthansa_Logo_2018.svg.png'; globalLogo.style.height = '40px'; }
        } else if (val === 'aerlingus') {
          aerLingusForm.style.display = 'block';
          aerLingusForm.querySelectorAll('input, textarea, select').forEach(el => el.disabled = false);
          if (globalLogo) { globalLogo.src = '/images/aer-lingus.png'; globalLogo.style.height = '40px'; }
        }
      });
      selector.dispatchEvent(new Event('change'));
    }

    // ==========================================
    // BULLETPROOF GLOBAL PASTE LISTENER
    // ==========================================
    const aiZoneContainer = document.getElementById('aiZoneContainer');
    const lhInput = document.getElementById('lufthansa-sig-input');

    document.addEventListener('paste', (e) => {
      const clipboard = e.clipboardData || window.clipboardData;
      let imageFound = false;
      const filesToProcess = [];

      if (clipboard.files && clipboard.files.length > 0) {
        for (let i = 0; i < clipboard.files.length; i++) {
          if (clipboard.files[i].type.startsWith('image/')) {
            filesToProcess.push(clipboard.files[i]);
          }
        }
      } else if (clipboard.items) {
        for (let i = 0; i < clipboard.items.length; i++) {
          if (clipboard.items[i].type.startsWith('image/')) {
            const file = clipboard.items[i].getAsFile();
            if (file) filesToProcess.push(file);
          }
        }
      }

      if (filesToProcess.length > 0) {
        imageFound = true;
        if (e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
          e.preventDefault();
        }

        const activeTemplate = selector.value;
        filesToProcess.forEach(file => {
          const newFile = new File([file], `sig_${Date.now()}_${Math.floor(Math.random()*1000)}.png`, { type: file.type || 'image/png' });
          
          if (activeTemplate === 'standard') {
            const stdInput = document.querySelector('#standardForm .sig-file-input');
            const dt = new DataTransfer();
            dt.items.add(newFile);
            stdInput.files = dt.files;
            showPreview(newFile, document.querySelector('#standardForm .sig-preview'), document.querySelector('#standardForm .drop-zone-text'));
          } else if (activeTemplate === 'aerlingus') {
            const aerInput = document.querySelector('#aerLingusForm .sig-file-input');
            const dt = new DataTransfer();
            dt.items.add(newFile);
            aerInput.files = dt.files;
            showPreview(newFile, document.querySelector('#aerLingusForm .sig-preview'), document.querySelector('#aerLingusForm .drop-zone-text'));
          } else {
            if (lufthansaDataTransfer.items.length < 4) {
              lufthansaDataTransfer.items.add(newFile);
              if (lhInput) lhInput.files = lufthansaDataTransfer.files;
              renderLufthansaPreviews();
            }
          }
        });
        
        // --- CLEANED: Using BEM class instead of inline style injection ---
        if (aiZoneContainer) {
          aiZoneContainer.classList.add('poa-ai-zone--success');
          setTimeout(() => {
            aiZoneContainer.classList.remove('poa-ai-zone--success');
          }, 400);
        }
      }
    });

    // ==========================================
    // CLICK & UPLOAD DROP ZONE LOGIC 
    // ==========================================
    document.querySelectorAll('#standardForm .drop-zone, #aerLingusForm .drop-zone').forEach(zone => {
      const input = zone.querySelector('.sig-file-input');
      const preview = zone.querySelector('.sig-preview');
      const text = zone.querySelector('.drop-zone-text');

      if (input && preview && text) {
        zone.addEventListener('click', () => input.click());
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
        zone.addEventListener('dragleave', e => { e.preventDefault(); zone.classList.remove('dragover'); });
        zone.addEventListener('drop', e => {
          e.preventDefault(); 
          zone.classList.remove('dragover');
          if (e.dataTransfer.files.length) {
            input.files = e.dataTransfer.files;
            showPreview(input.files[0], preview, text);
          }
        });
        input.addEventListener('change', () => {
          if (input.files.length) showPreview(input.files[0], preview, text);
        });
      }
    });

    // Lufthansa Multiple-File Drop Zone Logic
    const lhDropZone = document.getElementById('lufthansa-drop-zone');
    const lhPreviews = document.getElementById('lufthansa-sig-previews');
    
    if (lhDropZone && lhInput && lhPreviews) {
      lhDropZone.addEventListener('click', () => lhInput.click());
      lhDropZone.addEventListener('dragover', e => { e.preventDefault(); lhDropZone.classList.add('dragover'); });
      lhDropZone.addEventListener('dragleave', e => { e.preventDefault(); lhDropZone.classList.remove('dragover'); });
      lhDropZone.addEventListener('drop', e => {
        e.preventDefault();
        lhDropZone.classList.remove('dragover');
        handleLufthansaFiles(e.dataTransfer.files);
      });
      lhInput.addEventListener('change', () => {
        handleLufthansaFiles(lhInput.files);
      });
    }

    function handleLufthansaFiles(files) {
      for (let file of files) {
        if (file.type.startsWith('image/') && lufthansaDataTransfer.items.length < 4) {
          lufthansaDataTransfer.items.add(file);
        }
      }
      lhInput.files = lufthansaDataTransfer.files;
      renderLufthansaPreviews();
    }

    // Form Submit Handlers
    async function handleFormSubmit(event, formElement, endpoint) {
      event.preventDefault();
      document.getElementById('loader-overlay').style.setProperty('display', 'flex', 'important');
      try {
        const formData = new FormData(formElement);
        const response = await fetch(endpoint, { method: 'POST', body: formData });
        if (!response.ok) throw new Error(`Server Error: ${response.status}`);
        
        let filename = 'document.pdf';
        const disposition = response.headers.get('Content-Disposition');
        if (disposition && disposition.indexOf('filename=') !== -1) {
          const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
          if (matches != null && matches[1]) filename = matches[1].replace(/['"]/g, '');
        }

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(downloadUrl);
        a.remove();
        
        formElement.reset();
        if (formElement.id === 'standardForm' || formElement.id === 'aerLingusForm') {
          const preview = document.querySelector(`#${formElement.id} .sig-preview`);
          const text = document.querySelector(`#${formElement.id} .drop-zone-text`);
          if(preview) { preview.src = ''; preview.style.display = 'none'; }
          if(text) text.innerHTML = 'Click to Upload, Drag & Drop, or Paste (Ctrl+V)';
        } else if (formElement.id === 'lufthansaForm') {
          lufthansaDataTransfer = new DataTransfer();
          if (lhInput) lhInput.files = lufthansaDataTransfer.files;
          renderLufthansaPreviews();
        }
      } catch (error) { 
        console.error('PDF Generation Error:', error);
        alert('An error occurred while generating the PDF.'); 
      } finally { 
        document.getElementById('loader-overlay').style.setProperty('display', 'none', 'important');
      }
    }

    if (standardForm) standardForm.addEventListener('submit', (e) => handleFormSubmit(e, standardForm, '/generate-standard'));
    if (lufthansaForm) lufthansaForm.addEventListener('submit', (e) => handleFormSubmit(e, lufthansaForm, '/generate-lufthansa'));
    if (aerLingusForm) aerLingusForm.addEventListener('submit', (e) => handleFormSubmit(e, aerLingusForm, '/generate-aerlingus'));
    
    // AI Text Extraction Logic
    const aiBtn = document.getElementById('aiAutofillBtn');
    const aiInput = document.getElementById('aiAutofillInput');
    
    if (aiBtn && aiInput) {
      aiBtn.addEventListener('click', async () => {
        const text = aiInput.value.trim();
        if (!text) return alert("Please paste some text first!");

        const originalBtnText = aiBtn.innerText;
        aiBtn.innerText = "⏳ Extracting...";
        aiBtn.disabled = true;

        try {
          const response = await fetch('/api/autofill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messyText: text })
          });

          if (!response.ok) throw new Error("Failed to extract data");
    
          const data = await response.json();
          const activeTemplate = document.getElementById('templateSelector').value;
          let cleanDate = data.date && data.date.length >= 10 ? data.date.trim().substring(0, 10) : "";
          const passengers = data.passengers || [];

          if (activeTemplate === 'standard') {
            if (passengers.length > 0) {
              if (passengers[0].firstName) document.querySelector('#standardForm [name="firstName"]').value = passengers[0].firstName;
              if (passengers[0].lastName) document.querySelector('#standardForm [name="lastName"]').value = passengers[0].lastName;
            }
            if (data.address) document.querySelector('#standardForm [name="address"]').value = data.address;
            if (data.pnr) document.querySelector('#standardForm [name="pnr"]').value = data.pnr.toUpperCase();
            if (cleanDate) document.querySelector('#standardForm [name="date"]').value = cleanDate;
          } else if (activeTemplate === 'aerlingus') {
            if (passengers.length > 0) {
              if (passengers[0].firstName) document.querySelector('#aerLingusForm [name="firstName"]').value = passengers[0].firstName;
              if (passengers[0].lastName) document.querySelector('#aerLingusForm [name="lastName"]').value = passengers[0].lastName;
            }
            if (data.address) document.querySelector('#aerLingusForm [name="address"]').value = data.address;
            if (data.pnr) document.querySelector('#aerLingusForm [name="pnr"]').value = data.pnr.toUpperCase();
            if (data.flightNumber) document.querySelector('#aerLingusForm [name="flightNumber"]').value = data.flightNumber.toUpperCase();
            if (cleanDate) document.querySelector('#aerLingusForm [name="flightDate"]').value = cleanDate;
            if (data.route) document.querySelector('#aerLingusForm [name="route"]').value = data.route;
          } else {
            passengers.forEach((passenger, index) => {
              if (index < 4) { 
                const fullName = `${passenger.firstName || ''} ${passenger.lastName || ''}`.trim();
                if (fullName) {
                  const nameField = document.querySelector(`#lufthansaForm [name="fullName${index + 1}"]`);
                  if (nameField) nameField.value = fullName;
                }
              }
            });
            if (data.address) document.querySelector('#lufthansaForm [name="address1"]').value = data.address;
            if (data.pnr) document.querySelector('#lufthansaForm [name="pnr"]').value = data.pnr.toUpperCase();
            if (data.flightNumber) document.querySelector('#lufthansaForm [name="flightNumber"]').value = data.flightNumber.toUpperCase();
            if (cleanDate) document.querySelector('#lufthansaForm [name="flightDate"]').value = cleanDate;
          }
          aiInput.value = "";
        } catch (err) {
          console.error(err);
          alert("Oops! Gemini couldn't extract the data. Try pasting it differently.");
        } finally {
          aiBtn.innerText = originalBtnText;
          aiBtn.disabled = false;
        }
      });
    }

    // Shared Dropzone Functions
    function showPreview(file, previewElement, textElement) {
      if (!file.type.startsWith('image/')) return;
      previewElement.src = window.URL.createObjectURL(file);
      previewElement.style.display = 'block';
      textElement.innerHTML = '<small style="color:green">Signature Loaded!</small>';
    }

    function renderLufthansaPreviews() {
      const lhPreviews = document.getElementById('lufthansa-sig-previews');
      if (!lhPreviews) return;
      
      lhPreviews.innerHTML = '';
      if (lufthansaDataTransfer.files.length === 0) {
        lhPreviews.innerHTML = '<span id="preview-placeholder" class="poa-preview-placeholder">Previews appear here...</span>';
        return;
      }
      
      Array.from(lufthansaDataTransfer.files).forEach((file, index) => {
        // --- CLEANED: Using BEM classes instead of inline style injection ---
        const wrapper = document.createElement('div');
        wrapper.className = 'poa-preview-item';
        
        const header = document.createElement('div');
        header.className = 'poa-preview-item__header';
        
        const label = document.createElement('span');
        label.innerText = `Sig ${index + 1}`;
        label.className = 'poa-preview-item__label';
        
        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = "&times;";
        removeBtn.type = "button";
        removeBtn.className = 'poa-preview-item__remove';
        
        removeBtn.onclick = (event) => { 
          event.stopPropagation(); 
          const dt = new DataTransfer();
          const files = Array.from(lufthansaDataTransfer.files);
          files.splice(index, 1);
          files.forEach(f => dt.items.add(f));
          
          lufthansaDataTransfer = dt;
          document.getElementById('lufthansa-sig-input').files = lufthansaDataTransfer.files;
          renderLufthansaPreviews();
        };
        
        const img = document.createElement('img');
        img.src = window.URL.createObjectURL(file);
        img.className = 'poa-preview-item__img';
        
        header.appendChild(label);
        header.appendChild(removeBtn);
        wrapper.appendChild(header);
        wrapper.appendChild(img);
        lhPreviews.appendChild(wrapper);
      });
    }
});