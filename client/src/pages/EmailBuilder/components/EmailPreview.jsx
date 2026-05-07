import { useCallback, useMemo, useState } from 'react';
import { getWordCount } from '../emailBuilderUtils.js';
import EditableSection from './EditableSection.jsx';
import PlaceholderPanel from './PlaceholderPanel.jsx';

function splitIntoSections(text, userSectionIndices = new Set()) {
  if (!text) return [];
  return text.split(/\n\n/).map((t, i) => ({
    text: t,
    isUserAdded: userSectionIndices.has(i)
  }));
}

function joinSections(sections) {
  return sections.map((s) => s.text).join('\n\n');
}

export default function EmailPreview({
  output, setOutput,
  englishOutput, setEnglishOutput,
  error,
  language,
  activePreview, setActivePreview,
  placeholders, placeholderValues, onPlaceholderChange,
  copyState, onCopy,
  lastPayload,
  generating,
  onRegenerate,
  isTranslating,
  onRefineSection,
  refiningIndex,
  userSectionIndices, setUserSectionIndices
}) {
  const hasContent = !!output;
  const wordCount = getWordCount(activePreview === 'verify' ? englishOutput : output);
  const displayText = activePreview === 'verify' && language !== 'English' ? englishOutput : output;

  const sections = useMemo(
    () => splitIntoSections(displayText, userSectionIndices),
    [displayText, userSectionIndices]
  );

  const updateSection = useCallback((index, newText) => {
    const updated = sections.map((s, i) => (i === index ? { ...s, text: newText } : s));
    const joined = joinSections(updated);
    if (activePreview === 'verify' || language === 'English') {
      setEnglishOutput(joined);
      if (language === 'English') setOutput(joined);
    } else {
      setOutput(joined);
    }
  }, [sections, activePreview, language, setOutput, setEnglishOutput]);

  const spliceOtherSide = useCallback((fn) => {
    if (language === 'English') return;
    const isEnglishSide = activePreview === 'verify';
    const otherText = isEnglishSide ? output : englishOutput;
    const otherParts = otherText ? otherText.split(/\n\n/) : [];
    fn(otherParts);
    const setter = isEnglishSide ? setOutput : setEnglishOutput;
    setter(otherParts.join('\n\n'));
  }, [language, activePreview, output, englishOutput, setOutput, setEnglishOutput]);

  const addSection = useCallback(() => {
    const insertAt = sections.length > 0 ? sections.length - 1 : 0;
    const updated = [...sections];
    updated.splice(insertAt, 0, { text: '', isUserAdded: true });

    const newIndices = new Set();
    updated.forEach((s, i) => { if (s.isUserAdded) newIndices.add(i); });
    setUserSectionIndices(newIndices);

    const joined = updated.map((s) => s.text).join('\n\n');
    if (activePreview === 'verify' || language === 'English') {
      setEnglishOutput(joined);
      if (language === 'English') setOutput(joined);
    } else {
      setOutput(joined);
    }

    spliceOtherSide((parts) => { parts.splice(insertAt, 0, ''); });
  }, [sections, activePreview, language, setOutput, setEnglishOutput, setUserSectionIndices, spliceOtherSide]);

  const moveSection = useCallback((from, to) => {
    if (to < 0 || to >= sections.length) return;
    const reordered = [...sections];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);

    const newIndices = new Set();
    reordered.forEach((s, i) => { if (s.isUserAdded) newIndices.add(i); });
    setUserSectionIndices(newIndices);

    const joined = reordered.map((s) => s.text).join('\n\n');
    if (activePreview === 'verify' || language === 'English') {
      setEnglishOutput(joined);
      if (language === 'English') setOutput(joined);
    } else {
      setOutput(joined);
    }

    spliceOtherSide((parts) => {
      if (from < parts.length) {
        const [m] = parts.splice(from, 1);
        parts.splice(to, 0, m);
      }
    });
  }, [sections, activePreview, language, setOutput, setEnglishOutput, setUserSectionIndices, spliceOtherSide]);

  const mergeWithBelow = useCallback((index) => {
    if (index >= sections.length - 1) return;
    const updated = [...sections];
    const below = updated[index + 1].text.replace(/^[•\-\*]\s*/, '');
    updated[index] = { text: updated[index].text + ' ' + below, isUserAdded: true };
    updated.splice(index + 1, 1);

    const newIndices = new Set();
    updated.forEach((s, i) => { if (s.isUserAdded) newIndices.add(i); });
    setUserSectionIndices(newIndices);

    const joined = updated.map((s) => s.text).join('\n\n');
    if (activePreview === 'verify' || language === 'English') {
      setEnglishOutput(joined);
      if (language === 'English') setOutput(joined);
    } else {
      setOutput(joined);
    }

    spliceOtherSide((parts) => {
      if (index < parts.length - 1) {
        const otherBelow = parts[index + 1].replace(/^[•\-\*]\s*/, '');
        parts[index] = parts[index] + ' ' + otherBelow;
        parts.splice(index + 1, 1);
      }
    });
  }, [sections, activePreview, language, setOutput, setEnglishOutput, setUserSectionIndices, spliceOtherSide]);

  return (
    <section className="email-builder-right">
      <div className="email-preview-head">
        <h2>Preview</h2>
        <div className="email-preview-head__tabs">
          <button
            className={activePreview === 'output' ? 'is-active' : ''}
            onClick={() => setActivePreview('output')}
            type="button"
          >
            {language}
          </button>
          {language !== 'English' && (
            <button
              className={activePreview === 'verify' ? 'is-active' : ''}
              onClick={() => setActivePreview('verify')}
              type="button"
            >
              EN verify
            </button>
          )}
        </div>
      </div>

      <div className="email-preview-box">
        {error && <div className="email-builder-alert email-builder-alert--error">{error}</div>}

        {!hasContent && placeholders.length === 0 && !error && (
          <div className="email-empty-preview">Select content, then click Generate Email</div>
        )}

        {!hasContent && placeholders.length > 0 && (
          <PlaceholderPanel
            placeholders={placeholders}
            values={placeholderValues}
            onChange={onPlaceholderChange}
          />
        )}

        {hasContent && (
          <div className={`email-output-sections${activePreview === 'verify' && language !== 'English' ? ' email-output-text--verify' : ''}`}>
            {isTranslating && activePreview === 'output' && language !== 'English' && (
              <div className="email-translating-indicator">Translating...</div>
            )}
            {sections.map((section, i) => (
              <EditableSection
                key={i}
                value={section.text}
                onChange={(text) => updateSection(i, text)}
                showMagicWand={section.isUserAdded}
                onRefine={() => onRefineSection(i, section.text)}
                refining={refiningIndex === i}
                onMoveUp={i > 0 ? () => moveSection(i, i - 1) : null}
                onMoveDown={i < sections.length - 1 ? () => moveSection(i, i + 1) : null}
                onMergeDown={i < sections.length - 1 ? () => mergeWithBelow(i) : null}
              />
            ))}
            <button
              className="email-add-section-btn"
              onClick={addSection}
              type="button"
            >
              + Add Section
            </button>
          </div>
        )}
      </div>

      <div className="email-actions">
        <button onClick={() => onCopy(output, 'email')} type="button">
          {copyState === 'email' ? 'Copied!' : 'Copy Email'}
        </button>
        <button disabled={!lastPayload || generating} onClick={onRegenerate} type="button">
          Regenerate
        </button>
        {language !== 'English' && (
          <button onClick={() => onCopy(englishOutput, 'english')} type="button">
            {copyState === 'english' ? 'Copied!' : 'Copy English'}
          </button>
        )}
        <span>{output ? `${wordCount} words - ${output.length} chars` : '-'}</span>
      </div>
    </section>
  );
}
