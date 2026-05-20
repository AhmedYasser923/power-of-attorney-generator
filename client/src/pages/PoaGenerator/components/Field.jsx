import { useEffect, useRef, useState } from 'react';
import { parseDateFromDisplay } from '../../../utils/dateUtils.js';

export function Field({ children, label }) {
  return (
    <label className="poa-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props) {
  return <input className="poa-react-input" {...props} />;
}

function formatDateForDisplay(value) {
  if (!value) return '';

  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect height="18" rx="2" ry="2" width="18" x="3" y="4" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  );
}

export function DateInput({ name, onChange, required, value }) {
  const datePickerRef = useRef(null);
  const [dateDisplay, setDateDisplay] = useState(formatDateForDisplay(value));

  useEffect(() => {
    setDateDisplay(formatDateForDisplay(value));
  }, [value]);

  const emit = (nextDate) => {
    onChange?.({ target: { name, value: nextDate } });
  };

  const openDatePicker = () => {
    const input = datePickerRef.current;
    if (!input) return;

    if (typeof input.showPicker === 'function') input.showPicker();
    else input.click();
  };

  const handleTyping = (text) => {
    setDateDisplay(text);

    const parsed = parseDateFromDisplay(text);
    if (parsed) emit(parsed);
    else if (text.trim() === '') emit('');
  };

  const handlePaste = (event) => {
    const parsed = parseDateFromDisplay(event.clipboardData?.getData('text'));
    if (!parsed) return;

    event.preventDefault();
    setDateDisplay(formatDateForDisplay(parsed));
    emit(parsed);
  };

  const handlePickerChange = (event) => {
    const next = event.target.value;
    setDateDisplay(formatDateForDisplay(next));
    emit(next);
  };

  return (
    <div className="poa-date-control">
      <input
        className="poa-react-input"
        onChange={(event) => handleTyping(event.target.value)}
        onPaste={handlePaste}
        placeholder="Select or paste a date..."
        required={required}
        type="text"
        value={dateDisplay}
      />
      <input
        className="poa-date-picker"
        onChange={handlePickerChange}
        ref={datePickerRef}
        tabIndex={-1}
        type="date"
        value={value || ''}
      />
      <button
        aria-label="Choose date"
        className="poa-date-trigger"
        onClick={openDatePicker}
        type="button"
      >
        <CalendarIcon />
      </button>
    </div>
  );
}

export function TextArea(props) {
  return <textarea className="poa-react-textarea" {...props} />;
}

export function Select({ children, ...props }) {
  return (
    <select className="poa-react-select" {...props}>
      {children}
    </select>
  );
}
