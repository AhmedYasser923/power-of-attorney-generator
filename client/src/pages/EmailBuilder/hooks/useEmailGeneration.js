import { useCallback, useRef, useState } from 'react';
import { generateEmail } from '../../../api/emailBuilder.js';

const normalizeClipboardText = (text) => String(text || '').replace(/\r\n?/g, '\n');

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildClipboardHtml = (text) => {
  const normalized = normalizeClipboardText(text).trim();
  if (!normalized) return '';

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const content = escapeHtml(p).replace(/\n/g, '<br>');
      return `<p dir="auto" style="margin:0 0 12px;white-space:pre-wrap;">${content}</p>`;
    })
    .join('');

  return `<!doctype html><html><body>${paragraphs}</body></html>`;
};

const copyTextWithHiddenTextarea = (text) => {
  const textarea = document.createElement('textarea');
  textarea.value = normalizeClipboardText(text);
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
};

const writeClipboard = async (text) => {
  const plainText = normalizeClipboardText(text);
  const htmlText = buildClipboardHtml(text);

  if (window.ClipboardItem && navigator.clipboard?.write && htmlText) {
    await navigator.clipboard.write([
      new window.ClipboardItem({
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
        'text/html': new Blob([htmlText], { type: 'text/html' })
      })
    ]);
    return;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(plainText);
    return;
  }

  if (!copyTextWithHiddenTextarea(plainText)) {
    throw new Error('Legacy clipboard copy failed.');
  }
};

export default function useEmailGeneration() {
  const abortRef = useRef(null);

  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState('');
  const [englishOutput, setEnglishOutput] = useState('');
  const [lastGeneratedEnglish, setLastGeneratedEnglish] = useState('');
  const [error, setError] = useState('');
  const [lastPayload, setLastPayload] = useState(null);
  const [activePreview, setActivePreview] = useState('output');
  const [copyState, setCopyState] = useState('');

  const submitPayload = useCallback(async (payload, { resetCallback } = {}) => {
    if (!payload.selectedTemplates.length && !payload.customNote) {
      setError('Please select at least one template or add a custom note.');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);
    setError('');
    setOutput('');
    setEnglishOutput('');
    setLastGeneratedEnglish('');
    setActivePreview('output');

    try {
      const data = await generateEmail({ payload, signal: controller.signal });
      const email = data.email || '';
      const english = data.englishTranslation || email;
      setOutput(email);
      setEnglishOutput(english);
      setLastGeneratedEnglish(english);
      setLastPayload(payload);
      resetCallback?.();
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Network error while generating content.');
      }
    } finally {
      if (abortRef.current === controller) setGenerating(false);
    }
  }, []);

  const regenerate = useCallback(() => {
    if (lastPayload) submitPayload(lastPayload);
  }, [lastPayload, submitPayload]);

  const copyText = useCallback(async (text, key) => {
    if (!text) return;
    try {
      await writeClipboard(text);
      setCopyState(key);
      window.setTimeout(() => setCopyState(''), 1500);
    } catch {
      if (copyTextWithHiddenTextarea(text)) {
        setCopyState(key);
        window.setTimeout(() => setCopyState(''), 1500);
        return;
      }
      setError('Failed to copy to clipboard.');
    }
  }, []);

  const cleanup = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    generating,
    output, setOutput,
    englishOutput, setEnglishOutput,
    lastGeneratedEnglish,
    error, setError,
    lastPayload,
    activePreview, setActivePreview,
    copyState,
    submitPayload,
    regenerate,
    copyText,
    cleanup
  };
}
