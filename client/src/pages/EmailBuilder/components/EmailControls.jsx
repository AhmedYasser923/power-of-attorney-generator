export default function EmailControls({
  useNote, onUseNoteChange,
  customNote, onCustomNoteChange,
  useWrapper, onUseWrapperChange,
  showWrapper,
  generating,
  disabled
}) {
  return (
    <div className="email-builder-advanced">
      <div className="email-builder-toggle-row">
        <label className="email-builder-toggle">
          <input checked={useNote} onChange={(e) => onUseNoteChange(e.target.checked)} type="checkbox" />
          <span>Custom Request</span>
        </label>

        {showWrapper && (
          <label className="email-builder-toggle">
            <input checked={useWrapper} onChange={(e) => onUseWrapperChange(e.target.checked)} type="checkbox" />
            <span>Footer</span>
          </label>
        )}
      </div>

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

      <button
        aria-label={generating ? 'Generating email' : 'Generate email'}
        className={`email-generate-button${generating ? ' is-generating' : ''}`}
        disabled={disabled || generating}
        title={generating ? 'Generating email' : 'Generate email'}
        type="submit"
      >
        <span className="email-generate-button__mark" aria-hidden="true">
          <svg className="email-generate-button__icon" viewBox="0 0 24 24">
            <path className="email-generate-button__icon-envelope" d="M4.5 8h11.8v8.5H4.5z" />
            <path className="email-generate-button__icon-envelope" d="m5 8.5 5.4 3.9 5.4-3.9" />
            <path className="email-generate-button__icon-pen" d="m14.8 15.6 4.5-4.5 1.6 1.6-4.5 4.5-2.1.5z" />
            <path className="email-generate-button__icon-spark" d="m17.3 3.7.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" />
          </svg>
        </span>
        <span className="email-generate-button__writing" aria-hidden={!generating}>
          <span className="email-generate-button__writing-text">Generating</span>
          <svg className="email-generate-button__writing-pen" viewBox="0 0 18 18" aria-hidden="true">
            <path d="m3 14 2.8-.6 8-8L11.4 3l-8 8z" />
            <path d="m10.4 4 2.4 2.4" />
          </svg>
        </span>
        <span className="email-generate-button__ready-text">Compose Email</span>
      </button>
    </div>
  );
}
