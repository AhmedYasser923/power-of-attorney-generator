import { LANGUAGES } from '../emailBuilderUtils.js';

export default function EmailControls({
  useNote, onUseNoteChange,
  customNote, onCustomNoteChange,
  useWrapper, onUseWrapperChange,
  showWrapper,
  language, onLanguageChange,
  generating,
  disabled
}) {
  return (
    <div className="email-builder-advanced">
      <label className="email-builder-toggle">
        <input checked={useNote} onChange={(e) => onUseNoteChange(e.target.checked)} type="checkbox" />
        <span>Custom Request</span>
      </label>

      {useNote && (
        <label className="email-builder-field">
          <span>Additional Message</span>
          <textarea
            onChange={(e) => onCustomNoteChange(e.target.value)}
            placeholder="Additional message to include..."
            rows="3"
            spellCheck="true"
            value={customNote}
          />
        </label>
      )}

      {showWrapper && (
        <label className="email-builder-toggle">
          <input checked={useWrapper} onChange={(e) => onUseWrapperChange(e.target.checked)} type="checkbox" />
          <span>Add sign-off</span>
        </label>
      )}

      <label className="email-builder-field">
        <span>Language</span>
        <select onChange={(e) => onLanguageChange(e.target.value)} value={language}>
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>{lang}</option>
          ))}
        </select>
      </label>

      <button className="email-generate-button" disabled={disabled || generating} type="submit">
        {generating ? 'Generating...' : 'Generate Email'}
      </button>
    </div>
  );
}
