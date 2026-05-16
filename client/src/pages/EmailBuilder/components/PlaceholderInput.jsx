import { useRef } from 'react';
import { normalizePlaceholderName } from '../emailBuilderUtils.js';

const isDatePlaceholder = (normalizedName) => /\bdate\b/.test(normalizedName);
const normalizePastedDate = (text) => String(text || '').replace(/\s+/g, ' ').trim();
const toDatePickerValue = (text) => {
  const trimmed = String(text || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
};

function CalendarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

export default function PlaceholderInput({ name, label, onChange, value }) {
  const datePickerRef = useRef(null);
  const normalized = normalizePlaceholderName(name);
  const isDate = isDatePlaceholder(normalized);
  const handleDatePaste = (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
    onChange(name, normalizePastedDate(pasted));
  };
  const openDatePicker = (e) => {
    e.preventDefault();
    const picker = datePickerRef.current;
    if (!picker) return;
    if (typeof picker.showPicker === 'function') {
      picker.showPicker();
    } else {
      picker.focus();
    }
  };

  if (normalized === 'amount') {
    return (
      <label className="email-placeholder-field">
        <span>{label}</span>
        <div className="email-placeholder-amount">
          <span>EUR</span>
          <input
            inputMode="decimal"
            onChange={(e) => onChange(name, e.target.value)}
            placeholder={name}
            type="text"
            value={value || ''}
          />
        </div>
      </label>
    );
  }

  if (isDate) {
    return (
      <label className="email-placeholder-field">
        <span>{label}</span>
        <div className="email-placeholder-date">
          <input
            inputMode="text"
            onChange={(e) => onChange(name, e.target.value)}
            onPaste={handleDatePaste}
            placeholder="Paste or type a date"
            type="text"
            value={value || ''}
          />
          <button
            aria-label={`Pick ${label}`}
            className="email-placeholder-date__button"
            onClick={openDatePicker}
            title="Pick a date"
            type="button"
          >
            <CalendarIcon />
          </button>
          <input
            ref={datePickerRef}
            aria-hidden="true"
            className="email-placeholder-date__native"
            onChange={(e) => onChange(name, e.target.value)}
            tabIndex="-1"
            type="date"
            value={toDatePickerValue(value)}
          />
        </div>
      </label>
    );
  }

  return (
    <label className="email-placeholder-field">
      <span>{label}</span>
      <input
        onChange={(e) => onChange(name, e.target.value)}
        placeholder={name}
        type="text"
        value={value || ''}
      />
    </label>
  );
}
