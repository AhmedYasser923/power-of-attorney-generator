import { useCallback, useEffect, useRef, useState } from 'react';
import { translateEmail } from '../../../api/emailBuilder.js';

const DEBOUNCE_MS = 1000;

export default function useTranslationSync() {
  const abortRef = useRef(null);
  const timerRef = useRef(null);
  const [isTranslating, setIsTranslating] = useState(false);

  const cancel = useCallback(() => {
    clearTimeout(timerRef.current);
    abortRef.current?.abort();
    setIsTranslating(false);
  }, []);

  useEffect(() => cancel, [cancel]);

  const translate = useCallback((target, getText, onResult) => {
    clearTimeout(timerRef.current);
    abortRef.current?.abort();

    if (!target) {
      setIsTranslating(false);
      return;
    }

    setIsTranslating(true);

    timerRef.current = setTimeout(async () => {
      const text = typeof getText === 'function' ? getText() : getText;
      if (!text?.trim()) {
        setIsTranslating(false);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const data = await translateEmail({
          text,
          language: target,
          signal: controller.signal
        });
        if (abortRef.current === controller) {
          onResult(data.translated || '');
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Translation sync failed:', err.message);
        }
      } finally {
        if (abortRef.current === controller) setIsTranslating(false);
      }
    }, DEBOUNCE_MS);
  }, []);

  return { translate, isTranslating, cancel };
}
