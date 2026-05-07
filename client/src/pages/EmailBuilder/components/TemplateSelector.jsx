import { useMemo } from 'react';
import { groupTemplates } from '../emailBuilderUtils.js';
import LoadingSkeleton from './LoadingSkeleton.jsx';
import TemplatePill from './TemplatePill.jsx';

export default function TemplateSelector({
  templates,
  selectedTemplates,
  loading,
  onToggle,
  onManage
}) {
  const grouped = useMemo(() => groupTemplates(templates), [templates]);
  const selectedSet = useMemo(() => new Set(selectedTemplates), [selectedTemplates]);

  return (
    <>
      <div className="email-builder-section-head">
        <div>
          <h2>Select Content</h2>
          <p>Choose what to include in the email</p>
        </div>
        <button onClick={onManage} type="button">Manage</button>
      </div>

      <div className="email-template-groups">
        {loading && <LoadingSkeleton />}
        {!loading && grouped.map((group) => (
          <section className="email-template-choice-group" key={group.type}>
            <h3 className={group.type === 'rejection' ? 'is-rejection' : ''}>
              {group.category}
            </h3>
            <div>
              {group.templates.map((t) => (
                <TemplatePill
                  checked={selectedSet.has(t.key)}
                  isRejection={group.type === 'rejection'}
                  key={t.key}
                  label={t.label || t.key}
                  onChange={() => onToggle(t.key)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
