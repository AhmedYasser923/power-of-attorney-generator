import { useEffect, useRef, useState } from 'react';

function imageFiles(files) {
  return Array.from(files || []).filter((file) => file.type.startsWith('image/'));
}

function SignaturePreview({ file, label, onRemove }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setSrc(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return (
    <div className="poa-signature-preview">
      <div className="poa-signature-preview__top">
        <span>{label}</span>
        {onRemove && <button onClick={onRemove} type="button">x</button>}
      </div>
      <img alt="" src={src} />
    </div>
  );
}

export default function SignatureDropzone({ files, maxFiles = 1, multiple = false, onFilesChange }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const fileList = Array.isArray(files) ? files : files ? [files] : [];

  const addFiles = (incomingFiles) => {
    const nextFiles = multiple
      ? [...fileList, ...imageFiles(incomingFiles)].slice(0, maxFiles)
      : imageFiles(incomingFiles).slice(0, 1);

    onFilesChange(multiple ? nextFiles : nextFiles[0] || null);
  };

  const removeFile = (index) => {
    if (!multiple) {
      onFilesChange(null);
      return;
    }

    onFilesChange(fileList.filter((_, currentIndex) => currentIndex !== index));
  };

  return (
    <div
      className={`poa-signature-dropzone${dragging ? ' is-dragging' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragLeave={() => setDragging(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        addFiles(event.dataTransfer.files);
      }}
      role="button"
      tabIndex="0"
    >
      <input
        ref={inputRef}
        accept="image/*"
        className="poa-signature-dropzone__input"
        multiple={multiple}
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = '';
        }}
        type="file"
      />
      {fileList.length === 0 ? (
        <p>Click to Upload, Drag & Drop, or Paste</p>
      ) : (
        <div className="poa-signature-preview-grid">
          {fileList.map((file, index) => (
            <SignaturePreview
              file={file}
              key={`${file.name}-${file.lastModified}-${index}`}
              label={`Sig ${index + 1}`}
              onRemove={(event) => {
                event.stopPropagation();
                removeFile(index);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
