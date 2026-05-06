import { useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteEmailTemplate,
  generateEmail,
  getEmailTemplates,
  saveEmailTemplate
} from '../../api/emailBuilder.js';
import {
  CATEGORY_ORDER,
  deriveTemplatePayload,
  getSelectedPlaceholders,
  getWordCount,
  groupTemplates,
  LANGUAGES,
  normalizePlaceholderName
} from './emailBuilderUtils.js';
import './EmailBuilderPage.css';

const EMPTY_TEMPLATE_FORM = {
  key: '',
  label: '',
  category: 'Documents',
  text: ''
};

const normalizeClipboardText = (text) => String(text || '').replace(/\r\n?/g, '\n');

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildClipboardHtml = (text) => {
  const normalized = normalizeClipboardText(text).trim();
  if (!normalized) return '';

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const content = escapeHtml(paragraph).replace(/\n/g, '<br>');
      return `<p dir="auto" style="margin:0 0 12px;white-space:pre-wrap;">${content}</p>`;
    })
    .join('');

  return `<!doctype html><html><body>${paragraphs}</body></html>`;
};

const copyTextWithHiddenTextarea = (text) => {
  const textarea = document.createElement('textarea');
  textarea.value = normalizeClipboardText(text);
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
};

const writeClipboardText = async (text) => {
  const plainText = normalizeClipboardText(text);
  const htmlText = buildClipboardHtml(text);

  if (window.ClipboardItem && navigator.clipboard?.write && htmlText) {
    await navigator.clipboard.write([
      new window.ClipboardItem({
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
        'text/html': new Blob([htmlText], { type: 'text/html' })
      })
    ]);
    return;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(plainText);
    return;
  }

  if (!copyTextWithHiddenTextarea(plainText)) {
    throw new Error('Legacy clipboard copy failed.');
  }
};

function TemplatePill({ checked, isRejection, label, onChange }) {
  return (
    <label className={`email-builder-pill${checked ? ' is-selected' : ''}${isRejection ? ' is-rejection' : ''}`}>
      <input checked={checked} onChange={onChange} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}

function PlaceholderInput({ name, label, onChange, value }) {
  const normalized = normalizePlaceholderName(name);

  if (normalized === 'amount') {
    return (
      <label className="email-placeholder-field">
        <span>{label}</span>
        <div className="email-placeholder-amount">
          <span>EUR</span>
          <input
            inputMode="decimal"
            onChange={(event) => onChange(name, event.target.value)}
            placeholder={name}
            type="text"
            value={value || ''}
          />
        </div>
      </label>
    );
  }

  return (
    <label className="email-placeholder-field">
      <span>{label}</span>
      <input
        onChange={(event) => onChange(name, event.target.value)}
        placeholder={name}
        type={normalized === 'date' ? 'date' : 'text'}
        value={value || ''}
      />
    </label>
  );
}

function TemplateManager({
  busy,
  editingKey,
  form,
  message,
  onClose,
  onDelete,
  onEdit,
  onFormChange,
  onNew,
  onSave,
  templates
}) {
  const grouped = useMemo(() => groupTemplates(templates), [templates]);
  const isNew = editingKey === '__new__';

  return (
    <div className="email-template-backdrop" onMouseDown={onClose}>
      <section className="email-template-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="email-template-modal__header">
          <h2>Email Templates</h2>
          <div>
            <button onClick={onNew} type="button">Add Template</button>
            <button onClick={onClose} type="button">Close</button>
          </div>
        </header>

        {message && <div className="email-template-message">{message}</div>}

        {editingKey && (
          <form className="email-template-form" onSubmit={onSave}>
            <div className="email-template-form__grid">
              <label>
                <span>Display Label</span>
                <input
                  onChange={(event) => onFormChange({ label: event.target.value })}
                  placeholder="Short name shown on pill"
                  type="text"
                  value={form.label}
                />
              </label>
              <label>
                <span>Key</span>
                <input
                  onChange={(event) => onFormChange({ key: event.target.value })}
                  placeholder="Unique identifier"
                  readOnly={!isNew}
                  type="text"
                  value={form.key}
                />
              </label>
              <label>
                <span>Category</span>
                <select
                  onChange={(event) => onFormChange({ category: event.target.value })}
                  value={form.category}
                >
                  {CATEGORY_ORDER.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label className="email-template-form__full">
                <span>Template Text</span>
                <textarea
                  onChange={(event) => onFormChange({ text: event.target.value })}
                  placeholder="Email text... use {placeholder} for dynamic values"
                  rows="5"
                  value={form.text}
                />
              </label>
            </div>
            <div className="email-template-form__actions">
              <button disabled={busy} onClick={() => onEdit(null)} type="button">Cancel</button>
              <button disabled={busy} type="submit">{busy ? 'Saving...' : isNew ? 'Create' : 'Save Changes'}</button>
            </div>
          </form>
        )}

        <div className="email-template-list">
          {grouped.map((group) => (
            <section className="email-template-group" key={group.category}>
              <h3>{group.category}</h3>
              {group.templates.map((template) => (
                <div className="email-template-row" key={template.key}>
                  <div>
                    <strong>{template.label}</strong>
                    <span>{template.key}</span>
                    <p>{template.text}</p>
                  </div>
                  <div>
                    <button disabled={busy} onClick={() => onEdit(template)} type="button">Edit</button>
                    <button disabled={busy} onClick={() => onDelete(template)} type="button">Delete</button>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function EmailBuilderPage() {
  const loadAbortRef = useRef(null);
  const generateAbortRef = useRef(null);
  const templateAbortRef = useRef(null);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplates, setSelectedTemplates] = useState([]);
  const [placeholderValues, setPlaceholderValues] = useState({});
  const [link, setLink] = useState('');
  const [useNote, setUseNote] = useState(false);
  const [customNote, setCustomNote] = useState('');
  const [useWrapper, setUseWrapper] = useState(false);
  const [language, setLanguage] = useState(() => localStorage.getItem('emLastLanguage') || 'English');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [output, setOutput] = useState('');
  const [englishOutput, setEnglishOutput] = useState('');
  const [activePreview, setActivePreview] = useState('output');
  const [lastPayload, setLastPayload] = useState(null);
  const [copyState, setCopyState] = useState('');
  const [managerOpen, setManagerOpen] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateMessage, setTemplateMessage] = useState('');
  const [editingKey, setEditingKey] = useState(null);
  const [templateForm, setTemplateForm] = useState(EMPTY_TEMPLATE_FORM);

  useEffect(() => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    setLoadingTemplates(true);

    getEmailTemplates({ signal: controller.signal })
      .then((data) => setTemplates(data.templates || []))
      .catch((err) => {
        if (err.name !== 'AbortError') setError('Failed to load email templates.');
      })
      .finally(() => {
        if (loadAbortRef.current === controller) setLoadingTemplates(false);
      });

    return () => {
      loadAbortRef.current?.abort();
      generateAbortRef.current?.abort();
      templateAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('emLastLanguage', language);
    if (language === 'English' && activePreview === 'verify') {
      setActivePreview('output');
    }
  }, [activePreview, language]);

  const groupedTemplates = useMemo(() => groupTemplates(templates), [templates]);
  const placeholders = useMemo(
    () => getSelectedPlaceholders(templates, selectedTemplates),
    [selectedTemplates, templates]
  );
  const hasGeneratedContent = !!output;
  const hasRegularDocs = selectedTemplates.some((key) => {
    const template = templates.find((item) => item.key === key);
    return template?.type === 'document' && !template.noWrapper;
  });
  const selectedSet = useMemo(() => new Set(selectedTemplates), [selectedTemplates]);
  const wordCount = getWordCount(output);

  const toggleTemplate = (key) => {
    setSelectedTemplates((current) => (
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    ));
    setOutput('');
    setEnglishOutput('');
    setError('');
  };

  const updatePlaceholder = (name, value) => {
    setPlaceholderValues((current) => ({ ...current, [name]: value }));
    setOutput('');
    setEnglishOutput('');
  };

  const buildPayload = () => ({
    mode: 'request',
    language,
    selectedTemplates,
    link: link.trim(),
    customNote: useNote ? customNote.trim() : '',
    useWrapper,
    placeholderValues
  });

  const submitPayload = async (payload, { resetAfterSuccess } = { resetAfterSuccess: true }) => {
    if (!payload.selectedTemplates.length && !payload.customNote) {
      setError('Please select at least one template or add a custom note.');
      return;
    }

    generateAbortRef.current?.abort();
    const controller = new AbortController();
    generateAbortRef.current = controller;
    setGenerating(true);
    setError('');
    setOutput('');
    setEnglishOutput('');
    setActivePreview('output');

    try {
      const data = await generateEmail({ payload, signal: controller.signal });
      setOutput(data.email || '');
      setEnglishOutput(data.englishTranslation || data.email || '');
      setLastPayload(payload);

      if (resetAfterSuccess) {
        setSelectedTemplates([]);
        setPlaceholderValues({});
        setLink('');
        setUseNote(false);
        setCustomNote('');
        setUseWrapper(false);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Network error while generating content.');
      }
    } finally {
      if (generateAbortRef.current === controller) {
        setGenerating(false);
      }
    }
  };

  const submit = (event) => {
    event.preventDefault();
    submitPayload(buildPayload());
  };

  const regenerate = () => {
    if (lastPayload) submitPayload(lastPayload, { resetAfterSuccess: false });
  };

  const copyText = async (text, key) => {
    if (!text) return;

    try {
      await writeClipboardText(text);
      setCopyState(key);
      window.setTimeout(() => setCopyState(''), 1500);
    } catch {
      if (copyTextWithHiddenTextarea(text)) {
        setCopyState(key);
        window.setTimeout(() => setCopyState(''), 1500);
        return;
      }
      setError('Failed to copy to clipboard.');
    }
  };

  const openNewTemplate = () => {
    setTemplateMessage('');
    setEditingKey('__new__');
    setTemplateForm(EMPTY_TEMPLATE_FORM);
  };

  const editTemplate = (template) => {
    setTemplateMessage('');
    if (!template) {
      setEditingKey(null);
      setTemplateForm(EMPTY_TEMPLATE_FORM);
      return;
    }

    setEditingKey(template.key);
    setTemplateForm({
      key: template.key || '',
      label: template.label || '',
      category: template.category || 'Documents',
      text: template.text || ''
    });
  };

  const updateTemplateForm = (patch) => {
    setTemplateForm((current) => ({
      ...current,
      ...patch,
      key: editingKey === '__new__' && patch.label !== undefined && !current.key
        ? patch.label
        : patch.key ?? current.key
    }));
  };

  const saveTemplate = async (event) => {
    event.preventDefault();
    setTemplateMessage('');

    const payload = deriveTemplatePayload(templateForm);
    if (!payload.key || !payload.label || !payload.text || !payload.category) {
      setTemplateMessage('Label, key, category, and template text are required.');
      return;
    }

    templateAbortRef.current?.abort();
    const controller = new AbortController();
    templateAbortRef.current = controller;
    setTemplateBusy(true);

    try {
      const data = await saveEmailTemplate({
        template: payload,
        isNew: editingKey === '__new__',
        signal: controller.signal
      });
      setTemplates(data.templates || []);
      setEditingKey(null);
      setTemplateForm(EMPTY_TEMPLATE_FORM);
      setTemplateMessage('Template saved.');
    } catch (err) {
      if (err.name !== 'AbortError') {
        setTemplateMessage(err.message || 'Template save failed.');
      }
    } finally {
      if (templateAbortRef.current === controller) {
        setTemplateBusy(false);
      }
    }
  };

  const removeTemplate = async (template) => {
    if (!window.confirm(`Delete "${template.label || template.key}"? This cannot be undone.`)) return;

    templateAbortRef.current?.abort();
    const controller = new AbortController();
    templateAbortRef.current = controller;
    setTemplateBusy(true);
    setTemplateMessage('');

    try {
      const data = await deleteEmailTemplate({ key: template.key, signal: controller.signal });
      setTemplates(data.templates || []);
      setSelectedTemplates((current) => current.filter((key) => key !== template.key));
      setTemplateMessage('Template deleted.');
    } catch (err) {
      if (err.name !== 'AbortError') {
        setTemplateMessage(err.message || 'Template delete failed.');
      }
    } finally {
      if (templateAbortRef.current === controller) {
        setTemplateBusy(false);
      }
    }
  };

  return (
    <section className="email-builder-page" aria-labelledby="email-builder-title">
      <header className="email-builder-page__header">
        <h1 id="email-builder-title">Multilingual Email Builder</h1>
        <p>Generate passenger correspondence in multiple languages.</p>
      </header>

      <form className="email-builder-layout" onSubmit={submit}>
        <section className="email-builder-left">
          <div className="email-builder-section-head">
            <div>
              <h2>Select Content</h2>
              <p>Choose what to include in the email</p>
            </div>
            <button onClick={() => setManagerOpen(true)} type="button">Manage</button>
          </div>

          <div className="email-template-groups">
            {loadingTemplates && <div className="email-builder-alert">Loading templates...</div>}
            {!loadingTemplates && groupedTemplates.map((group) => (
              <section className="email-template-choice-group" key={group.category}>
                <h3 className={group.category === 'Rejection Reason' ? 'is-rejection' : ''}>
                  {group.category}
                </h3>
                <div>
                  {group.templates.map((template) => (
                    <TemplatePill
                      checked={selectedSet.has(template.key)}
                      isRejection={group.category === 'Rejection Reason'}
                      key={template.key}
                      label={template.label || template.key}
                      onChange={() => toggleTemplate(template.key)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="email-builder-advanced">
            <label className="email-builder-field">
              <span>Upload Link</span>
              <input
                onChange={(event) => setLink(event.target.value)}
                placeholder="https://..."
                type="text"
                value={link}
              />
            </label>

            <label className="email-builder-toggle">
              <input checked={useNote} onChange={(event) => setUseNote(event.target.checked)} type="checkbox" />
              <span>Custom Request</span>
            </label>

            {useNote && (
              <label className="email-builder-field">
                <span>Additional Message</span>
                <textarea
                  onChange={(event) => setCustomNote(event.target.value)}
                  placeholder="Additional message to include..."
                  rows="3"
                  value={customNote}
                />
              </label>
            )}

            {!hasRegularDocs && (
              <label className="email-builder-toggle">
                <input checked={useWrapper} onChange={(event) => setUseWrapper(event.target.checked)} type="checkbox" />
                <span>Add sign-off</span>
              </label>
            )}

            <label className="email-builder-field">
              <span>Language</span>
              <select onChange={(event) => setLanguage(event.target.value)} value={language}>
                {LANGUAGES.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <button className="email-generate-button" disabled={generating || loadingTemplates} type="submit">
              {generating ? 'Generating...' : 'Generate Email'}
            </button>
          </div>
        </section>

        <section className="email-builder-right">
          <div className="email-preview-head">
            <h2>Preview</h2>
            <div>
              <button
                className={activePreview === 'output' ? 'is-active' : ''}
                onClick={() => setActivePreview('output')}
                type="button"
              >
                {language}
              </button>
              {language !== 'English' && (
                <button
                  className={activePreview === 'verify' ? 'is-active' : ''}
                  onClick={() => setActivePreview('verify')}
                  type="button"
                >
                  EN verify
                </button>
              )}
            </div>
          </div>

          <div className="email-preview-box">
            {error && <div className="email-builder-alert email-builder-alert--error">{error}</div>}

            {!hasGeneratedContent && placeholders.length === 0 && !error && (
              <div className="email-empty-preview">Select content, then click Generate Email</div>
            )}

            {!hasGeneratedContent && placeholders.length > 0 && (
              <section className="email-placeholder-panel">
                <h3>Fill in the details</h3>
                <div>
                  {placeholders.map((placeholder) => (
                    <PlaceholderInput
                      key={placeholder.name}
                      label={placeholder.label}
                      name={placeholder.name}
                      onChange={updatePlaceholder}
                      value={placeholderValues[placeholder.name]}
                    />
                  ))}
                </div>
              </section>
            )}

            {hasGeneratedContent && activePreview === 'output' && (
              <div className="email-output-text">{output}</div>
            )}

            {hasGeneratedContent && activePreview === 'verify' && language !== 'English' && (
              <div className="email-output-text email-output-text--verify">{englishOutput}</div>
            )}
          </div>

          <div className="email-actions">
            <button onClick={() => copyText(output, 'email')} type="button">
              {copyState === 'email' ? 'Copied!' : 'Copy Email'}
            </button>
            <button disabled={!lastPayload || generating} onClick={regenerate} type="button">Regenerate</button>
            {language !== 'English' && (
              <button onClick={() => copyText(englishOutput, 'english')} type="button">
                {copyState === 'english' ? 'Copied!' : 'Copy English'}
              </button>
            )}
            <span>{output ? `${wordCount} words - ${output.length} chars` : '-'}</span>
          </div>
        </section>
      </form>

      {managerOpen && (
        <TemplateManager
          busy={templateBusy}
          editingKey={editingKey}
          form={templateForm}
          message={templateMessage}
          onClose={() => setManagerOpen(false)}
          onDelete={removeTemplate}
          onEdit={editTemplate}
          onFormChange={updateTemplateForm}
          onNew={openNewTemplate}
          onSave={saveTemplate}
          templates={templates}
        />
      )}
    </section>
  );
}
