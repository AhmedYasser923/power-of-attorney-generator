import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import MagicWandButton from './MagicWandButton.jsx';

const EditableSection = forwardRef(function EditableSection({
  value,
  onChange,
  onRefine,
  refining,
  onMoveUp,
  onMoveDown,
  onMergeDown,
  onAddNext,
  onDelete
}, ref) {
  const rootRef = useRef(null);
  const textareaRef = useRef(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  useImperativeHandle(ref, () => ({
    focus: (opts = {}) => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus({ preventScroll: !!opts.preventScroll });
      if (opts.atStart) el.setSelectionRange(0, 0);
      else if (opts.atEnd) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    },
    getRoot: () => rootRef.current
  }));

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey && onAddNext) {
      const el = textareaRef.current;
      if (el && el.selectionStart === value.length && el.selectionEnd === value.length) {
        e.preventDefault();
        onAddNext();
        return;
      }
    }
    if (!e.altKey) return;
    if (e.key === 'ArrowUp' && onMoveUp) {
      e.preventDefault();
      onMoveUp();
    } else if (e.key === 'ArrowDown' && onMoveDown) {
      e.preventDefault();
      onMoveDown();
    } else if ((e.key === 'm' || e.key === 'M') && onMergeDown) {
      e.preventDefault();
      onMergeDown();
    }
  }, [onMoveUp, onMoveDown, onMergeDown, onAddNext, value]);

  return (
    <div className="email-editable-section" ref={rootRef}>
      <textarea
        ref={textareaRef}
        className="email-editable-section__textarea"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        rows="1"
        spellCheck="true"
        value={value}
      />
      <div className="email-section-toolbar" role="toolbar" aria-label="Section actions">
        {onMoveUp && (
          <button
            className="email-section-toolbar__btn"
            onClick={onMoveUp}
            title="Move up (Alt+↑)"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
          </button>
        )}
        {onMoveDown && (
          <button
            className="email-section-toolbar__btn"
            onClick={onMoveDown}
            title="Move down (Alt+↓)"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14" />
              <path d="m19 12-7 7-7-7" />
            </svg>
          </button>
        )}
        {onMergeDown && (
          <button
            className="email-section-toolbar__btn"
            onClick={onMergeDown}
            title="Merge with section below (Alt+M)"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 7h8" />
              <path d="M8 17h8" />
              <path d="m12 7 0 10" />
              <path d="m9 14 3 3 3-3" />
            </svg>
          </button>
        )}
        {onDelete && (
          <button
            className="email-section-toolbar__btn email-section-toolbar__btn--danger"
            onClick={onDelete}
            title="Delete section"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
              <path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
          </button>
        )}
        <MagicWandButton onClick={onRefine} refining={refining} />
      </div>
    </div>
  );
});

export default EditableSection;
