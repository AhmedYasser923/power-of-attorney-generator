import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeBarcodeImage } from '../../api/barcodeDecoder.js';
import './BarcodeDecoderPage.css';

function UploadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      <path d="M7 9l5-5 5 5" />
      <path d="M12 4v12" />
    </svg>
  );
}

function BarcodeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 5v14" />
      <path d="M7 5v14" />
      <path d="M11 5v14" />
      <path d="M14 5v14" />
      <path d="M20 5v14" />
      <path d="M17 5v14" />
    </svg>
  );
}

const FAILURE_TIPS = {
  timeout: 'Try a tighter crop around the barcode area.',
  too_small: 'Use a larger image where the barcode takes more space.',
  too_blurry: 'Retake the image with steadier focus or upload a sharper crop.',
  low_contrast: 'Use a brighter image or crop away dark background around the barcode.',
  manual_adjustment_needed: 'Crop closer to the barcode and keep all edges visible.',
  no_barcode_found: 'Make sure the full barcode is visible in the image.',
};

const confidenceLabel = (value) => {
  if (value === 'high') return 'High confidence';
  if (value === 'medium') return 'Medium confidence';
  if (value === 'low') return 'Low confidence';
  return 'Decoder result';
};

export default function BarcodeDecoderPage({ isActive = true }) {
  const abortRef = useRef(null);
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [dragging, setDragging] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [errorDetails, setErrorDetails] = useState(null);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const setSelectedFile = useCallback((nextFile) => {
    if (!nextFile) return;
    if (!nextFile.type.startsWith('image/')) {
      setError('Upload an image file only.');
      setErrorDetails(null);
      return;
    }

    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(nextFile);
    });
    setFile(nextFile);
    setResult(null);
    setError('');
    setErrorDetails(null);
  }, []);

  useEffect(() => {
    if (!isActive) return undefined;

    const handlePaste = (event) => {
      const pastedFile = Array.from(event.clipboardData?.files || []).find((item) => item.type.startsWith('image/'));
      if (pastedFile) setSelectedFile(pastedFile);
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isActive, setSelectedFile]);

  const clear = () => {
    abortRef.current?.abort();
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });
    setFile(null);
    setResult(null);
    setError('');
    setErrorDetails(null);
    setDecoding(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const decode = async () => {
    if (!file) {
      setError('Upload a barcode image first.');
      setErrorDetails(null);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setDecoding(true);
    setError('');
    setErrorDetails(null);
    setResult(null);

    try {
      const payload = await decodeBarcodeImage({
        file,
        signal: abortRef.current.signal,
      });

      if (!payload.success) {
        setError(payload.error || 'Could not decode barcode.');
        setErrorDetails(payload);
        return;
      }

      setResult(payload);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
        setErrorDetails(null);
      }
    } finally {
      setDecoding(false);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    const droppedFile = Array.from(event.dataTransfer.files || []).find((item) => item.type.startsWith('image/'));
    if (droppedFile) setSelectedFile(droppedFile);
  };

  return (
    <section className="barcode-decoder" aria-labelledby="barcode-decoder-title">
      <header className="barcode-decoder__header">
        <h1 id="barcode-decoder-title">Barcode Decoder</h1>
      </header>

      <button
        className={`barcode-dropzone${dragging ? ' is-dragging' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragging(false);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        type="button"
      >
        <span className="barcode-dropzone__upload-icon">
          <UploadIcon />
        </span>
        <span className="barcode-dropzone__title">Drop barcode or boarding pass image</span>
        <span className="barcode-dropzone__meta">PNG, JPG, WEBP</span>
        <input
          accept="image/*"
          className="barcode-dropzone__input"
          onChange={(event) => setSelectedFile(event.target.files?.[0])}
          ref={inputRef}
          type="file"
        />
      </button>

      {file && (
        <div className="barcode-preview">
          <div className="barcode-preview__image">
            <img alt="" src={previewUrl} />
          </div>
          <div className="barcode-preview__actions">
            <span className="barcode-preview__name">{file.name}</span>
            <button className="barcode-preview__decode" disabled={decoding} onClick={decode} type="button">
              <BarcodeIcon />
              <span>{decoding ? 'Decoding...' : 'Decode'}</span>
            </button>
            <button className="barcode-preview__clear" disabled={decoding} onClick={clear} type="button">
              Clear
            </button>
          </div>
        </div>
      )}

      {decoding && (
        <div className="barcode-status" role="status">
          Recovering barcode...
        </div>
      )}

      {error && (
        <div className="barcode-error" role="alert">
          <strong>{error}</strong>
          <span>{FAILURE_TIPS[errorDetails?.reason] || 'Use a sharp image with the full barcode, visible edges, and a small margin.'}</span>
        </div>
      )}

      {result && (
        <section className="barcode-raw-result" aria-labelledby="barcode-raw-title">
          <div className={`barcode-result-meta is-${result.confidence || 'unknown'}`}>
            <strong>{confidenceLabel(result.confidence)}</strong>
            <span>
              {result.decodeInfo?.bcbpValid
                ? 'Boarding pass structure matched'
                : result.decodeInfo?.aggressiveProcessingUsed
                  ? 'Recovered from enhanced copy'
                  : 'Decoded without aggressive recovery'}
            </span>
          </div>
          <details className="barcode-raw-details" open>
            <summary>Raw Barcode String</summary>
            <pre>{result.raw}</pre>
          </details>
        </section>
      )}
    </section>
  );
}
