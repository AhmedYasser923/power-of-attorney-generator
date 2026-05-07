import { useMemo } from 'react';
import { groupTemplates } from '../emailBuilderUtils.js';
import TemplateForm from './TemplateForm.jsx';

export default function TemplateManager({
  busy,
  editingKey,
  form,
  message,
  onClose,
  onDelete,
  onEdit,
  onFormChange,
  onNew,
  onOpenReferences,
  onSave,
  templates
}) {
  const grouped = useMemo(() => groupTemplates(templates), [templates]);
  const isNew = editingKey === '__new__';

  return (
    <div className="email-template-backdrop" onMouseDown={onClose}>
      <section className="email-template-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="email-template-modal__header">
          <h2>Email Templates</h2>
          <div>
            <button onClick={onOpenReferences} type="button">AI References</button>
            <button onClick={onNew} type="button">Add Template</button>
            <button onClick={onClose} type="button">Close</button>
          </div>
        </header>

        {message && <div className="email-template-message">{message}</div>}

        {editingKey && (
          <TemplateForm
            form={form}
            isNew={isNew}
            busy={busy}
            onFormChange={onFormChange}
            onSave={onSave}
            onCancel={() => onEdit(null)}
          />
        )}

        <div className="email-template-list">
          {grouped.map((group) => (
            <section className="email-template-group" key={group.category}>
              <h3>{group.category}</h3>
              {group.templates.map((t) => (
                <div className="email-template-row" key={t.key}>
                  <div>
                    <strong>{t.label}</strong>
                    <span>{t.key}</span>
                    <p>{t.text}</p>
                  </div>
                  <div>
                    <button disabled={busy} onClick={() => onEdit(t)} type="button">Edit</button>
                    <button disabled={busy} onClick={() => onDelete(t)} type="button">Delete</button>
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
