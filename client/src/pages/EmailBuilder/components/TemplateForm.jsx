import { TYPE_ORDER, TYPE_LABELS } from '../emailBuilderUtils.js';

export default function TemplateForm({ form, isNew, busy, onFormChange, onSave, onCancel }) {
  return (
    <form className="email-template-form" onSubmit={onSave}>
      <div className="email-template-form__grid">
        <label>
          <span>Display Label</span>
          <input
            onChange={(e) => onFormChange({ label: e.target.value })}
            placeholder="Short name shown on pill"
            type="text"
            value={form.label}
          />
        </label>
        <label>
          <span>Key</span>
          <input
            onChange={(e) => onFormChange({ key: e.target.value })}
            placeholder="Unique identifier"
            readOnly={!isNew}
            type="text"
            value={form.key}
          />
        </label>
        <label>
          <span>Type</span>
          <select
            onChange={(e) => onFormChange({ type: e.target.value })}
            value={form.type || 'document-request'}
          >
            {TYPE_ORDER.map((type) => (
              <option key={type} value={type}>{TYPE_LABELS[type]}</option>
            ))}
          </select>
        </label>
        {(form.type || 'document-request') === 'special-case' && (
          <label className="email-builder-toggle email-template-form__full">
            <input
              checked={!!form.combineWithDocuments}
              onChange={(e) => onFormChange({ combineWithDocuments: e.target.checked })}
              type="checkbox"
            />
            <span>Can be used alongside document requests</span>
          </label>
        )}
        <label className="email-template-form__full">
          <span>Template Text</span>
          <textarea
            onChange={(e) => onFormChange({ text: e.target.value })}
            placeholder="Email text... use {placeholder} for dynamic values"
            rows="5"
            spellCheck="true"
            value={form.text}
          />
        </label>
      </div>
      <div className="email-template-form__actions">
        <button disabled={busy} onClick={onCancel} type="button">Cancel</button>
        <button disabled={busy} type="submit">{busy ? 'Saving...' : isNew ? 'Create' : 'Save Changes'}</button>
      </div>
    </form>
  );
}
