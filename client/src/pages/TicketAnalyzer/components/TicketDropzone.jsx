import { useEffect, useRef, useState } from 'react';

const PDF_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />
    <path d="M10 13v4" />
    <path d="M14 13v4" />
    <path d="M10 13h1a2 2 0 0 1 0 4h-1" />
  </svg>
);

const IMG_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
);

function filesFromList(fileList) {
  return Array.from(fileList || []).filter((file) =>
    file.type.startsWith('image/') || file.type === 'application/pdf'
  );
}

export default function TicketDropzone({ active = true, onFilesAdd }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!active) return undefined;

    const paste = (event) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      const pastedFiles = [];
      Array.from(items).forEach((item) => {
        if (!item.type.startsWith('image/') && item.type !== 'application/pdf') return;

        const file = item.getAsFile();
        if (!file) return;

        const extension = file.type.split('/')[1] || 'png';
        pastedFiles.push(new File([file], `Pasted_${Date.now()}.${extension}`, { type: file.type }));
      });

      if (pastedFiles.length > 0) {
        onFilesAdd(pastedFiles);
      }
    };

    document.addEventListener('paste', paste);

    return () => {
      document.removeEventListener('paste', paste);
    };
  }, [active, onFilesAdd]);

  const openPicker = () => {
    inputRef.current?.click();
  };

  const addInputFiles = (event) => {
    const files = filesFromList(event.target.files);

    if (files.length > 0) {
      onFilesAdd(files);
    }

    event.target.value = '';
  };

  const drop = (event) => {
    event.preventDefault();
    setDragging(false);

    const files = filesFromList(event.dataTransfer.files);
    if (files.length > 0) onFilesAdd(files);
  };

  const keyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  };

  return (
    <div
      className={`ticket-dropzone${dragging ? ' is-dragging' : ''}`}
      onClick={openPicker}
      onDragLeave={() => setDragging(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDrop={drop}
      onKeyDown={keyDown}
      role="button"
      tabIndex="0"
    >
      <div className="ticket-dropzone__upload-icon" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>
      <h2>Click, Drag & Drop, or Paste</h2>
      <div className="ticket-dropzone__formats" aria-hidden="true">
        <span className="ticket-dropzone__format">{PDF_ICON} PDF</span>
        <span className="ticket-dropzone__format">{IMG_ICON} PNG</span>
        <span className="ticket-dropzone__format">{IMG_ICON} JPG</span>
      </div>
      <input
        ref={inputRef}
        accept="image/*,application/pdf"
        className="ticket-dropzone__input"
        multiple
        onChange={addInputFiles}
        type="file"
      />
    </div>
  );
}
