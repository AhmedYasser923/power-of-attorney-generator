function getFilesLabel(files) {
  if (files.length === 1) return `1 file ready: ${files[0].name}`;

  return `${files.length} files ready`;
}

export default function TicketPreviewBar({ analyzing, elapsedSeconds, files, onAnalyze, onClear }) {
  if (!files.length) return null;

  return (
    <div className="ticket-preview">
      <div className="ticket-preview__header">
        <p>{getFilesLabel(files)}</p>
        <button
          aria-label="Clear all files"
          className="ticket-preview__clear"
          onClick={onClear}
          type="button"
        >
          x
        </button>
      </div>
      <button
        className="ticket-preview__analyze"
        disabled={analyzing}
        onClick={onAnalyze}
        type="button"
      >
        {analyzing ? `Analyzing... ${elapsedSeconds.toFixed(1)}s` : 'Extract Ticket Data'}
      </button>
    </div>
  );
}
