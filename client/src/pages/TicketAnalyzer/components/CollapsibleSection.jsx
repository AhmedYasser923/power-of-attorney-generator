import { useState } from 'react';

export default function CollapsibleSection({ children, count, title }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`ta-collapse${expanded ? ' is-expanded' : ''}`}>
      <button
        className="ta-collapse__trigger"
        type="button"
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="ta-collapse__icon">{expanded ? 'v' : '>'}</span>
        <span>{title}{typeof count === 'number' ? ` (${count})` : ''}</span>
      </button>
      {expanded && (
        <div className="ta-collapse__content">
          {children}
        </div>
      )}
    </div>
  );
}
