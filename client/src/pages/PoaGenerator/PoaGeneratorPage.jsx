import { useCallback, useEffect, useState } from 'react';
import { autofillPoa, generatePoaPdf } from '../../api/poa.js';
import AerLingusPoaForm from './components/AerLingusPoaForm.jsx';
import LufthansaPoaForm from './components/LufthansaPoaForm.jsx';
import StandardPoaForm from './components/StandardPoaForm.jsx';
import {
  INITIAL_AERLINGUS,
  INITIAL_LUFTHANSA,
  INITIAL_STANDARD,
  TEMPLATE_OPTIONS
} from './poaConstants.js';
import './PoaGeneratorPage.css';

const ENDPOINTS = {
  standard: '/api/poa/generate-standard',
  lufthansa: '/api/poa/generate-lufthansa',
  aerlingus: '/api/poa/generate-aerlingus'
};

function getCleanDate(date) {
  return date && date.length >= 10 ? date.trim().substring(0, 10) : '';
}

function cloneFile(file) {
  return new File([file], `sig_${Date.now()}_${Math.floor(Math.random() * 1000)}.png`, {
    type: file.type || 'image/png'
  });
}

function appendObject(formData, object) {
  Object.entries(object).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      formData.append(key, value);
    }
  });
}

export default function PoaGeneratorPage() {
  const [template, setTemplate] = useState('standard');
  const [standard, setStandard] = useState(INITIAL_STANDARD);
  const [lufthansa, setLufthansa] = useState(INITIAL_LUFTHANSA);
  const [aerLingus, setAerLingus] = useState(INITIAL_AERLINGUS);
  const [standardSignature, setStandardSignature] = useState(null);
  const [aerLingusSignature, setAerLingusSignature] = useState(null);
  const [lufthansaSignatures, setLufthansaSignatures] = useState([]);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [submitting, setSubmitting] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pasteFlash, setPasteFlash] = useState(false);

  const updateStandard = (event) => {
    const { name, value } = event.target;
    setStandard((current) => ({ ...current, [name]: name === 'pnr' ? value.toUpperCase() : value }));
  };

  const updateLufthansa = (event) => {
    const { name, value } = event.target;
    setLufthansa((current) => ({
      ...current,
      [name]: ['pnr', 'flightNumber'].includes(name) ? value.toUpperCase() : value
    }));
  };

  const updateAerLingus = (event) => {
    const { name, value } = event.target;
    setAerLingus((current) => ({
      ...current,
      [name]: ['pnr', 'flightNumber'].includes(name) ? value.toUpperCase() : value
    }));
  };

  const addPastedSignatures = useCallback((files) => {
    if (files.length === 0) return;

    if (template === 'standard') {
      setStandardSignature(files[0]);
    } else if (template === 'aerlingus') {
      setAerLingusSignature(files[0]);
    } else {
      setLufthansaSignatures((current) => [...current, ...files].slice(0, 4));
    }

    setPasteFlash(true);
    window.setTimeout(() => setPasteFlash(false), 400);
  }, [template]);

  useEffect(() => {
    const paste = (event) => {
      const clipboard = event.clipboardData || window.clipboardData;
      const files = [];

      Array.from(clipboard?.files || []).forEach((file) => {
        if (file.type.startsWith('image/')) files.push(cloneFile(file));
      });

      if (files.length === 0) {
        Array.from(clipboard?.items || []).forEach((item) => {
          if (!item.type.startsWith('image/')) return;
          const file = item.getAsFile();
          if (file) files.push(cloneFile(file));
        });
      }

      if (files.length === 0) return;

      if (!['INPUT', 'TEXTAREA'].includes(event.target.tagName)) {
        event.preventDefault();
      }

      addPastedSignatures(files);
    };

    document.addEventListener('paste', paste);

    return () => document.removeEventListener('paste', paste);
  }, [addPastedSignatures]);

  const runAutofill = async () => {
    const text = aiText.trim();
    if (!text) {
      setError('Please paste text before using AI autofill.');
      return;
    }

    setError('');
    setMessage('');
    setAiLoading(true);

    try {
      const data = await autofillPoa(text);
      const cleanDate = getCleanDate(data.date);
      const passengers = data.passengers || [];

      if (template === 'standard') {
        setStandard((current) => ({
          ...current,
          firstName: passengers[0]?.firstName || current.firstName,
          lastName: passengers[0]?.lastName || current.lastName,
          address: data.address || current.address,
          pnr: data.pnr ? data.pnr.toUpperCase() : current.pnr,
          date: cleanDate || current.date
        }));
      } else if (template === 'aerlingus') {
        setAerLingus((current) => ({
          ...current,
          firstName: passengers[0]?.firstName || current.firstName,
          lastName: passengers[0]?.lastName || current.lastName,
          address: data.address || current.address,
          pnr: data.pnr ? data.pnr.toUpperCase() : current.pnr,
          flightNumber: data.flightNumber ? data.flightNumber.toUpperCase() : current.flightNumber,
          flightDate: cleanDate || current.flightDate,
          route: data.route || current.route
        }));
      } else {
        setLufthansa((current) => {
          const next = {
            ...current,
            address1: data.address || current.address1,
            pnr: data.pnr ? data.pnr.toUpperCase() : current.pnr,
            flightNumber: data.flightNumber ? data.flightNumber.toUpperCase() : current.flightNumber,
            flightDate: cleanDate || current.flightDate
          };

          passengers.slice(0, 4).forEach((passenger, index) => {
            const fullName = `${passenger.firstName || ''} ${passenger.lastName || ''}`.trim();
            if (fullName) next[`fullName${index + 1}`] = fullName;
          });

          return next;
        });
      }

      setAiText('');
      setMessage('Autofill completed.');
    } catch (err) {
      setError(err.message || "AI couldn't extract the data. Try a different paste.");
    } finally {
      setAiLoading(false);
    }
  };

  const buildFormData = (kind) => {
    const formData = new FormData();

    if (kind === 'standard') {
      appendObject(formData, standard);
      if (standardSignature) formData.append('signature', standardSignature);
    } else if (kind === 'lufthansa') {
      appendObject(formData, lufthansa);
      lufthansaSignatures.forEach((file) => formData.append('signatures', file));
    } else {
      appendObject(formData, aerLingus);
      if (aerLingusSignature) formData.append('signature', aerLingusSignature);
    }

    return formData;
  };

  const resetTemplate = (kind) => {
    if (kind === 'standard') {
      setStandard(INITIAL_STANDARD);
      setStandardSignature(null);
    } else if (kind === 'lufthansa') {
      setLufthansa(INITIAL_LUFTHANSA);
      setLufthansaSignatures([]);
    } else {
      setAerLingus(INITIAL_AERLINGUS);
      setAerLingusSignature(null);
    }
  };

  const submitTemplate = async (kind, event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (kind === 'aerlingus' && !aerLingusSignature) {
      setError('Aer Lingus signature image is required.');
      return;
    }

    setSubmitting(kind);

    try {
      const { filename } = await generatePoaPdf({
        endpoint: ENDPOINTS[kind],
        formData: buildFormData(kind)
      });

      resetTemplate(kind);
      setMessage(`${filename} generated.`);
    } catch (err) {
      setError(err.message || 'An error occurred while generating the PDF.');
    } finally {
      setSubmitting('');
    }
  };

  return (
    <section className="poa-react" aria-labelledby="poa-react-title">
      {submitting && (
        <div className="poa-react-loader" role="status">
          <div className="poa-react-spinner" />
          <p>Generating PDF... Please wait</p>
        </div>
      )}

      <header className="poa-react__header">
        <h1 id="poa-react-title">POA Generator</h1>
        <p>Generate Power of Attorney documents with AI autofill and signature processing.</p>
      </header>

      <label className="poa-field poa-field--template">
        <span>Select Template Format</span>
        <select
          className="poa-react-select"
          onChange={(event) => {
            setTemplate(event.target.value);
            setError('');
            setMessage('');
          }}
          value={template}
        >
          {TEMPLATE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>

      <section className={`poa-ai-box${pasteFlash ? ' is-success' : ''}`}>
        <label htmlFor="poa-ai-text">AI Autofill & Signature Drop</label>
        <p>Paste text for AI extraction. Pasted images auto-attach to the active form.</p>
        <textarea
          id="poa-ai-text"
          onChange={(event) => setAiText(event.target.value)}
          placeholder="Paste text here..."
          rows="3"
          value={aiText}
        />
        <button disabled={aiLoading} onClick={runAutofill} type="button">
          {aiLoading ? 'Extracting...' : 'Extract & Fill Form'}
        </button>
      </section>

      {error && <div className="poa-react-alert poa-react-alert--error">{error}</div>}
      {message && <div className="poa-react-alert poa-react-alert--success">{message}</div>}

      {template === 'standard' && (
        <StandardPoaForm
          form={standard}
          onChange={updateStandard}
          onSignatureChange={setStandardSignature}
          onSubmit={(event) => submitTemplate('standard', event)}
          signature={standardSignature}
          submitting={submitting === 'standard'}
        />
      )}

      {template === 'lufthansa' && (
        <LufthansaPoaForm
          form={lufthansa}
          onChange={updateLufthansa}
          onSignaturesChange={setLufthansaSignatures}
          onSubmit={(event) => submitTemplate('lufthansa', event)}
          signatures={lufthansaSignatures}
          submitting={submitting === 'lufthansa'}
        />
      )}

      {template === 'aerlingus' && (
        <AerLingusPoaForm
          form={aerLingus}
          onChange={updateAerLingus}
          onSignatureChange={setAerLingusSignature}
          onSubmit={(event) => submitTemplate('aerlingus', event)}
          signature={aerLingusSignature}
          submitting={submitting === 'aerlingus'}
        />
      )}
    </section>
  );
}
