import { useEffect, useRef, useState } from 'react';

function getFilesLabel(files) {
  if (files.length === 1) return `1 file ready: ${files[0].name}`;

  return `${files.length} files ready`;
}

export default function TicketPreviewBar({ analyzing, elapsedSeconds, files, modelTier, onAnalyze, onClear, onTierChange }) {
  const wasAnalyzing = useRef(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (wasAnalyzing.current && !analyzing) {
      setCompleted(true);
      const timer = setTimeout(() => setCompleted(false), 1200);
      return () => clearTimeout(timer);
    }
    wasAnalyzing.current = analyzing;
  }, [analyzing]);

  if (!files.length) return null;

  const pillClass = [
    'ticket-preview__pill',
    analyzing && 'is-analyzing',
    completed && 'is-completed'
  ].filter(Boolean).join(' ');

  return (
    <div className="ticket-preview">
      <div className="ticket-preview__header">
        <div className={pillClass}>
          <span className="ticket-preview__pill-text">
            {analyzing ? `Analyzing... ${elapsedSeconds.toFixed(1)}s` : getFilesLabel(files)}
          </span>
          {analyzing && <div className="ticket-preview__progress" />}
        </div>
        <button
          aria-label="Clear all files"
          className="ticket-preview__clear"
          onClick={onClear}
          type="button"
        >
          x
        </button>
        <div className="ticket-preview__tier" role="radiogroup" aria-label="Analysis model">
          <button
            type="button"
            role="radio"
            aria-checked={modelTier === 'standard'}
            className={`ticket-preview__tier-option${modelTier === 'standard' ? ' is-active' : ''}`}
            onClick={() => onTierChange?.('standard')}
            disabled={analyzing}
            title="gemini-3-flash-preview — cheaper, for simple tickets"
          >
            gemini-3-flash-preview
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={modelTier === 'advanced'}
            className={`ticket-preview__tier-option${modelTier === 'advanced' ? ' is-active' : ''}`}
            onClick={() => onTierChange?.('advanced')}
            disabled={analyzing}
            title="gemini-3.5-flash — smarter, for complicated multi-document cases"
          >
            gemini-3.5-flash
          </button>
        </div>
        <button
          aria-label="Analyze ticket"
          className={`ticket-preview__gemini${analyzing ? ' is-analyzing' : ''}`}
          disabled={analyzing}
          onClick={onAnalyze}
          type="button"
        >
          <img alt="" src="/images/gemini-color.svg" />
        </button>
      </div>
    </div>
  );
}
