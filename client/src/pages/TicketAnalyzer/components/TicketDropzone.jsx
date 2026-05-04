import { useEffect, useRef, useState } from 'react';

function filesFromList(fileList) {
  return Array.from(fileList || []).filter((file) =>
    file.type.startsWith('image/') || file.type === 'application/pdf'
  );
}

export default function TicketDropzone({ onFilesAdd }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
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
  }, [onFilesAdd]);

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
      <span className="ticket-dropzone__icon" aria-hidden="true">IN</span>
      <h2>Click, Drag & Drop, or Paste</h2>
      <p>Supports multiple PDFs, PNGs, and JPGs at once</p>
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
