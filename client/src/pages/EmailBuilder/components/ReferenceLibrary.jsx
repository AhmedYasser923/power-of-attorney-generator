import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteEmailReference,
  getEmailReferences,
  saveEmailReference
} from '../../../api/emailBuilder.js';

export default function ReferenceLibrary({ onClose }) {
  const abortRef = useRef(null);
  const [references, setReferences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    getEmailReferences({ signal: controller.signal })
      .then((data) => setReferences(data.references || []))
      .catch((err) => {
        if (err.name !== 'AbortError') setMessage('Failed to load references.');
      })
      .finally(() => setLoading(false));

    return () => abortRef.current?.abort();
  }, []);

  const save = useCallback(async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setMessage('Title and content are required.');
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      const data = await saveEmailReference({ title: title.trim(), content: content.trim() });
      setReferences(data.references || []);
      setTitle('');
      setContent('');
      setShowForm(false);
      setMessage('Reference saved.');
    } catch (err) {
      setMessage(err.message || 'Failed to save reference.');
    } finally {
      setBusy(false);
    }
  }, [title, content]);

  const remove = useCallback(async (ref) => {
    if (!window.confirm(`Delete "${ref.title}"?`)) return;

    setBusy(true);
    setMessage('');

    try {
      const data = await deleteEmailReference({ id: ref._id });
      setReferences(data.references || []);
      setMessage('Reference deleted.');
    } catch (err) {
      setMessage(err.message || 'Failed to delete reference.');
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="email-template-backdrop" onMouseDown={onClose}>
      <section className="email-template-modal email-reference-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="email-template-modal__header">
          <h2>AI Reference Library</h2>
          <div>
            <button disabled={busy} onClick={() => setShowForm(!showForm)} type="button">
              {showForm ? 'Cancel' : 'Add Reference'}
            </button>
            <button onClick={onClose} type="button">Close</button>
          </div>
        </header>

        <div className="email-reference-info">
          {references.length}/3 references saved — used as AI context when generating and refining emails.
        </div>

        {message && <div className="email-template-message">{message}</div>}

        {showForm && (
          <form className="email-template-form" onSubmit={save}>
            <div className="email-template-form__grid" style={{ gridTemplateColumns: '1fr' }}>
              <label>
                <span>Title</span>
                <input
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Sample follow-up email"
                  type="text"
                  value={title}
                />
              </label>
              <label>
                <span>Reference Content</span>
                <textarea
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Paste a past email or communication sample..."
                  rows="6"
                  spellCheck="true"
                  value={content}
                />
              </label>
            </div>
            <div className="email-template-form__actions">
              <button disabled={busy} type="submit">{busy ? 'Saving...' : 'Save Reference'}</button>
            </div>
          </form>
        )}

        <div className="email-template-list">
          {loading && <div className="email-builder-alert">Loading references...</div>}
          {!loading && !references.length && (
            <div className="email-builder-alert">No references yet. Add past emails or communications for AI context.</div>
          )}
          {references.map((ref) => (
            <div className="email-template-row" key={ref._id}>
              <div>
                <strong>{ref.title}</strong>
                <p>{ref.content}</p>
              </div>
              <div>
                <button disabled={busy} onClick={() => remove(ref)} type="button">Delete</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
