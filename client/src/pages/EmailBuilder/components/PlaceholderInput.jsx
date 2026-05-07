import { normalizePlaceholderName } from '../emailBuilderUtils.js';

export default function PlaceholderInput({ name, label, onChange, value }) {
  const normalized = normalizePlaceholderName(name);

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

  return (
    <label className="email-placeholder-field">
      <span>{label}</span>
      <input
        onChange={(e) => onChange(name, e.target.value)}
        placeholder={name}
        type={normalized === 'date' ? 'date' : 'text'}
        value={value || ''}
      />
    </label>
  );
}
