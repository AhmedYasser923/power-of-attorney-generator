import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { getWordCount, LANGUAGES } from '../emailBuilderUtils.js';
import EditableSection from './EditableSection.jsx';
import PlaceholderPanel from './PlaceholderPanel.jsx';

function splitIntoSections(text) {
  if (!text) return [];
  return text.split(/\n\n/);
}

function joinSections(sections) {
  return sections.join('\n\n');
}

export default function EmailPreview({
  output, setOutput,
  englishOutput, setEnglishOutput,
  error,
  language, onLanguageChange,
  translatingLanguage,
  activePreview, setActivePreview,
  placeholders, placeholderValues, onPlaceholderChange,
  copyState, onCopy,
  lastPayload,
  generating,
  onRegenerate,
  isTranslating,
  onRefineSection,
  refiningIndex,
  canUndoRefine,
  onUndoRefine
}) {
  const hasContent = !!output;
  const displayText = activePreview === 'verify' && language !== 'English' ? englishOutput : output;
  const wordCount = getWordCount(displayText);
  const charCount = displayText ? displayText.length : 0;

  const sections = useMemo(() => splitIntoSections(displayText), [displayText]);

  const sectionRefs = useRef([]);
  const pendingFocusRef = useRef(null);
  const pendingMoveRef = useRef(null);

  useEffect(() => {
    if (pendingFocusRef.current !== null) {
      const idx = pendingFocusRef.current;
      pendingFocusRef.current = null;
      sectionRefs.current[idx]?.focus?.({ atStart: true });
    }
  });

  useLayoutEffect(() => {
    const pending = pendingMoveRef.current;
    if (!pending) return;
    pendingMoveRef.current = null;

    const { from, to, fromRect, toRect } = pending;
    const nodeAtFrom = sectionRefs.current[from]?.getRoot?.();
    const nodeAtTo = sectionRefs.current[to]?.getRoot?.();

    if (nodeAtTo && fromRect && toRect && typeof nodeAtTo.animate === 'function') {
      const delta = fromRect.top - toRect.top;
      nodeAtTo.animate(
        [
          { transform: `translateY(${delta}px)`, zIndex: 1 },
          { transform: 'translateY(0)', zIndex: 1 }
        ],
        { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' }
      );
    }
    if (nodeAtFrom && fromRect && toRect && typeof nodeAtFrom.animate === 'function') {
      const delta = toRect.top - fromRect.top;
      nodeAtFrom.animate(
        [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }],
        { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' }
      );
    }

    sectionRefs.current[to]?.focus?.({ preventScroll: true });
  }, [sections]);

  const writeJoined = useCallback((joined) => {
    if (activePreview === 'verify' || language === 'English') {
      setEnglishOutput(joined);
      if (language === 'English') setOutput(joined);
    } else {
      setOutput(joined);
    }
  }, [activePreview, language, setOutput, setEnglishOutput]);

  const spliceOtherSide = useCallback((fn) => {
    if (language === 'English') return;
    const isEnglishSide = activePreview === 'verify';
    const otherText = isEnglishSide ? output : englishOutput;
    const otherParts = otherText ? otherText.split(/\n\n/) : [];
    fn(otherParts);
    const setter = isEnglishSide ? setOutput : setEnglishOutput;
    setter(otherParts.join('\n\n'));
  }, [language, activePreview, output, englishOutput, setOutput, setEnglishOutput]);

  const updateSection = useCallback((index, newText) => {
    if (/\n\n/.test(newText)) {
      pendingFocusRef.current = index + 1;
    }
    const updated = sections.map((s, i) => (i === index ? newText : s));
    writeJoined(joinSections(updated));
  }, [sections, writeJoined]);

  const moveSection = useCallback((from, to) => {
    if (to < 0 || to >= sections.length) return;

    const fromRoot = sectionRefs.current[from]?.getRoot?.();
    const toRoot = sectionRefs.current[to]?.getRoot?.();
    const fromRect = fromRoot?.getBoundingClientRect?.();
    const toRect = toRoot?.getBoundingClientRect?.();
    if (fromRect && toRect) {
      pendingMoveRef.current = { from, to, fromRect, toRect };
    }

    const reordered = [...sections];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    writeJoined(joinSections(reordered));

    spliceOtherSide((parts) => {
      if (from < parts.length) {
        const [m] = parts.splice(from, 1);
        parts.splice(to, 0, m);
      }
    });
  }, [sections, writeJoined, spliceOtherSide]);

  const mergeWithBelow = useCallback((index) => {
    if (index >= sections.length - 1) return;
    const updated = [...sections];
    const below = updated[index + 1].replace(/^[•\-\*]\s*/, '');
    updated[index] = updated[index] + ' ' + below;
    updated.splice(index + 1, 1);
    writeJoined(joinSections(updated));

    spliceOtherSide((parts) => {
      if (index < parts.length - 1) {
        const otherBelow = parts[index + 1].replace(/^[•\-\*]\s*/, '');
        parts[index] = parts[index] + ' ' + otherBelow;
        parts.splice(index + 1, 1);
      }
    });
  }, [sections, writeJoined, spliceOtherSide]);

  const deleteSection = useCallback((index) => {
    const updated = sections.filter((_, i) => i !== index);
    writeJoined(joinSections(updated));
    spliceOtherSide((parts) => {
      if (index < parts.length) parts.splice(index, 1);
    });
  }, [sections, writeJoined, spliceOtherSide]);

  const currentCopyText = activePreview === 'verify' && language !== 'English' ? englishOutput : output;
  const currentCopyKey = activePreview === 'verify' && language !== 'English' ? 'english' : 'email';
  const currentCopyLabel = activePreview === 'verify' && language !== 'English' ? 'Copy English' : 'Copy Email';

  return (
    <section className="email-builder-right">
      <div className="email-preview-head">
        <h2>Preview</h2>
        <div className="email-preview-head__controls">
          <label className="email-preview-head__language">
            <span className="visually-hidden">Language</span>
            <select
              disabled={translatingLanguage || generating}
              onChange={(e) => onLanguageChange(e.target.value)}
              value={language}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </label>
          {language !== 'English' && hasContent && (
            <div className="email-preview-head__tabs" role="tablist">
              <button
                className={activePreview === 'output' ? 'is-active' : ''}
                onClick={() => setActivePreview('output')}
                type="button"
              >
                {language}
              </button>
              <button
                className={activePreview === 'verify' ? 'is-active' : ''}
                onClick={() => setActivePreview('verify')}
                type="button"
              >
                English
              </button>
            </div>
          )}
        </div>
      </div>

      {placeholders.length > 0 && (
        <div className="email-preview-placeholders">
          <PlaceholderPanel
            placeholders={placeholders}
            values={placeholderValues}
            onChange={onPlaceholderChange}
          />
        </div>
      )}

      <div className="email-preview-box">
        {error && <div className="email-builder-alert email-builder-alert--error">{error}</div>}

        {(isTranslating || translatingLanguage) && (
          <div className="email-translating-indicator">
            {translatingLanguage ? `Translating to ${language}...` : 'Translating...'}
          </div>
        )}

        {!hasContent && placeholders.length === 0 && !error && (
          <div className="email-empty-preview">Select content, then click Generate Email</div>
        )}

        {!hasContent && placeholders.length > 0 && !error && (
          <div className="email-empty-preview email-empty-preview--secondary">
            Fill in the details above, then click Generate Email
          </div>
        )}

        {hasContent && (
          <div className={`email-output-sections${activePreview === 'verify' && language !== 'English' ? ' email-output-text--verify' : ''}`}>
            {sections.map((text, i) => {
              const isLast = i === sections.length - 1;
              const isPenultimate = i === sections.length - 2;
              return (
                <EditableSection
                  key={i}
                  ref={(el) => { sectionRefs.current[i] = el; }}
                  value={text}
                  onChange={(t) => updateSection(i, t)}
                  onRefine={() => onRefineSection(i, text)}
                  refining={refiningIndex === i}
                  onMoveUp={i > 0 && !isLast ? () => moveSection(i, i - 1) : null}
                  onMoveDown={!isLast && !isPenultimate ? () => moveSection(i, i + 1) : null}
                  onMergeDown={!isLast ? () => mergeWithBelow(i) : null}
                  onDelete={sections.length > 1 ? () => deleteSection(i) : null}
                />
              );
            })}
            <p className="email-section-hints">
              Tip: press Enter twice to split a new section. Alt+↑ / Alt+↓ reorder, Alt+M merges with below.
            </p>
          </div>
        )}
      </div>

      <div className="email-actions">
        <button
          className="email-actions__primary"
          disabled={!currentCopyText}
          onClick={() => onCopy(currentCopyText, currentCopyKey)}
          type="button"
        >
          {copyState === currentCopyKey ? 'Copied!' : currentCopyLabel}
        </button>
        {language !== 'English' && activePreview === 'output' && (
          <button
            className="email-actions__secondary"
            disabled={!englishOutput}
            onClick={() => onCopy(englishOutput, 'english')}
            type="button"
          >
            {copyState === 'english' ? 'Copied!' : 'Copy English'}
          </button>
        )}
        <button disabled={!lastPayload || generating} onClick={onRegenerate} type="button">
          Regenerate
        </button>
        {canUndoRefine && (
          <button className="email-actions__undo" onClick={onUndoRefine} type="button" title="Undo last AI refinement">
            Undo refine
          </button>
        )}
        <span className="email-actions__counter">
          {output ? `${wordCount} words · ${charCount} chars` : '-'}
        </span>
      </div>
    </section>
  );
}
