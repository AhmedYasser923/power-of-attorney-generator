import { useCallback, useEffect, useRef } from 'react';
import MagicWandButton from './MagicWandButton.jsx';

export default function EditableSection({
  value,
  onChange,
  showMagicWand,
  onRefine,
  refining,
  onMoveUp,
  onMoveDown,
  onMergeDown
}) {
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

  const handleKeyDown = useCallback((e) => {
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
  }, [onMoveUp, onMoveDown, onMergeDown]);

  return (
    <div className="email-editable-section">
      <textarea
        ref={textareaRef}
        className="email-editable-section__textarea"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        rows="1"
        spellCheck="true"
        value={value}
      />
      {showMagicWand && (
        <MagicWandButton onClick={onRefine} refining={refining} />
      )}
    </div>
  );
}
