import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { refineEmailSection, translateEmail } from '../../api/emailBuilder.js';
import { getSelectedPlaceholders } from './emailBuilderUtils.js';
import useEmailGeneration from './hooks/useEmailGeneration.js';
import useEmailTemplates from './hooks/useEmailTemplates.js';
import useTranslationSync from './hooks/useTranslationSync.js';
import EmailControls from './components/EmailControls.jsx';
import EmailPreview from './components/EmailPreview.jsx';
import ReferenceLibrary from './components/ReferenceLibrary.jsx';
import TemplateManager from './components/TemplateManager.jsx';
import TemplateSelector from './components/TemplateSelector.jsx';
import './EmailBuilderPage.css';

export default function EmailBuilderPage() {
  const tpl = useEmailTemplates();
  const gen = useEmailGeneration();

  const [selectedTemplates, setSelectedTemplates] = useState([]);
  const [placeholderValues, setPlaceholderValues] = useState({});
  const [useNote, setUseNote] = useState(false);
  const [customNote, setCustomNote] = useState('');
  const [useWrapper, setUseWrapper] = useState(false);
  const [language, setLanguage] = useState(() => localStorage.getItem('emLastLanguage') || 'English');
  const [managerOpen, setManagerOpen] = useState(false);
  const [referencesOpen, setReferencesOpen] = useState(false);
  const [refiningIndex, setRefiningIndex] = useState(-1);
  const [refineSnapshot, setRefineSnapshot] = useState(null);
  const [translatingLanguage, setTranslatingLanguage] = useState(false);

  const translationSync = useTranslationSync(language);

  // Cache of english body -> { [language]: translatedText }, so flipping
  // back to a previously-seen language is free.
  const translationCacheRef = useRef({ key: '', map: {} });

  useEffect(() => {
    localStorage.setItem('emLastLanguage', language);
    if (language === 'English' && gen.activePreview === 'verify') {
      gen.setActivePreview('output');
    }
  }, [language, gen.activePreview]);

  useEffect(() => () => gen.cleanup(), [gen.cleanup]);

  // Invalidate translation cache whenever the English baseline changes
  // (new generation, user edit on verify tab, refine, reorder, merge).
  useEffect(() => {
    if (translationCacheRef.current.key !== gen.englishOutput) {
      translationCacheRef.current = { key: gen.englishOutput, map: {} };
    }
  }, [gen.englishOutput]);

  const placeholders = useMemo(
    () => getSelectedPlaceholders(tpl.templates, selectedTemplates),
    [selectedTemplates, tpl.templates]
  );

  const hasRegularDocs = selectedTemplates.some((key) => {
    const t = tpl.templates.find((item) => item.key === key);
    return t?.type === 'document-request';
  });

  const toggleTemplate = useCallback((key) => {
    const toggled = tpl.templates.find((t) => t.key === key);
    if (!toggled) return;

    setSelectedTemplates((curr) => {
      if (curr.includes(key)) return curr.filter((k) => k !== key);

      if (toggled.type === 'rejection') return [key];

      const withoutRejections = curr.filter((k) => {
        const t = tpl.templates.find((item) => item.key === k);
        return t?.type !== 'rejection';
      });

      if (toggled.type === 'special-case' && !toggled.combineWithDocuments) {
        return [key];
      }
      const withoutStandalone = withoutRejections.filter((k) => {
        const t = tpl.templates.find((item) => item.key === k);
        return !(t?.type === 'special-case' && !t.combineWithDocuments);
      });

      return [...withoutStandalone, key];
    });
    gen.setOutput('');
    gen.setEnglishOutput('');
    gen.setError('');
  }, [gen, tpl.templates]);

  const updatePlaceholder = useCallback((name, value) => {
    setPlaceholderValues((curr) => ({ ...curr, [name]: value }));
  }, []);

  const buildPayload = useCallback(() => ({
    mode: 'request',
    language,
    selectedTemplates,
    customNote: useNote ? customNote.trim() : '',
    useWrapper,
    placeholderValues
  }), [language, selectedTemplates, useNote, customNote, useWrapper, placeholderValues]);

  const submit = useCallback((e) => {
    e.preventDefault();
    gen.submitPayload(buildPayload(), {
      resetCallback: () => {
        setSelectedTemplates([]);
        setPlaceholderValues({});
        setUseNote(false);
        setCustomNote('');
        setUseWrapper(false);
        setRefineSnapshot(null);
      }
    });
  }, [buildPayload, gen]);

  const handleRegenerate = useCallback(() => {
    const hasEdits = gen.englishOutput && gen.englishOutput !== gen.lastGeneratedEnglish;
    if (hasEdits && !window.confirm('Regenerate? Your edits will be discarded.')) {
      return;
    }
    setRefineSnapshot(null);
    gen.regenerate();
  }, [gen]);

  const handleEnglishEdit = useCallback((text) => {
    gen.setEnglishOutput(text);
    if (language === 'English') {
      gen.setOutput(text);
    } else {
      translationSync.translate(text, (translated) => gen.setOutput(translated));
    }
  }, [language, gen, translationSync]);

  const handleLanguageChange = useCallback(async (newLanguage) => {
    if (newLanguage === language) return;
    setLanguage(newLanguage);

    if (!gen.englishOutput) return;

    if (newLanguage === 'English') {
      gen.setOutput(gen.englishOutput);
      gen.setActivePreview('output');
      return;
    }

    const cache = translationCacheRef.current;
    if (cache.key === gen.englishOutput && cache.map[newLanguage]) {
      gen.setOutput(cache.map[newLanguage]);
      return;
    }

    setTranslatingLanguage(true);
    try {
      const data = await translateEmail({
        text: gen.englishOutput,
        language: newLanguage
      });
      const translated = data.translated || '';
      if (translationCacheRef.current.key === gen.englishOutput) {
        translationCacheRef.current.map[newLanguage] = translated;
      }
      gen.setOutput(translated);
    } catch (err) {
      gen.setError(err.message || 'Translation failed.');
    } finally {
      setTranslatingLanguage(false);
    }
  }, [language, gen]);

  const handleRefineSection = useCallback(async (index, sectionText) => {
    if (!sectionText?.trim()) return;
    setRefiningIndex(index);

    const snapshot = { output: gen.output, englishOutput: gen.englishOutput };

    const context = gen.englishOutput || gen.output;
    try {
      const data = await refineEmailSection({
        section: sectionText,
        context,
        language
      });
      if (data.refined) {
        const currentText = gen.activePreview === 'verify' || language === 'English'
          ? gen.englishOutput
          : gen.output;
        const sections = currentText.split(/\n\n/);
        sections[index] = data.refined;
        const joined = sections.join('\n\n');

        gen.setEnglishOutput(joined);
        if (language === 'English') {
          gen.setOutput(joined);
        } else if (data.translatedRefined) {
          const translatedSections = gen.output.split(/\n\n/);
          translatedSections[index] = data.translatedRefined;
          gen.setOutput(translatedSections.join('\n\n'));
        }
        setRefineSnapshot(snapshot);
      }
    } catch (err) {
      gen.setError(err.message || 'Refinement failed.');
    } finally {
      setRefiningIndex(-1);
    }
  }, [gen, language]);

  const handleUndoRefine = useCallback(() => {
    if (!refineSnapshot) return;
    gen.setOutput(refineSnapshot.output);
    gen.setEnglishOutput(refineSnapshot.englishOutput);
    setRefineSnapshot(null);
  }, [refineSnapshot, gen]);

  const removeSelectedTemplate = useCallback((key) => {
    setSelectedTemplates((curr) => curr.filter((k) => k !== key));
  }, []);

  return (
    <section className="email-builder-page" aria-labelledby="email-builder-title">
      <header className="email-builder-page__header">
        <h1 id="email-builder-title">Multilingual Email Builder</h1>
        <p>Generate passenger correspondence in multiple languages.</p>
      </header>

      <form className="email-builder-layout" onSubmit={submit}>
        <section className="email-builder-left">
          <TemplateSelector
            templates={tpl.templates}
            selectedTemplates={selectedTemplates}
            loading={tpl.loading}
            onToggle={toggleTemplate}
            onManage={() => setManagerOpen(true)}
          />

          <EmailControls
            useNote={useNote}
            onUseNoteChange={setUseNote}
            customNote={customNote}
            onCustomNoteChange={setCustomNote}
            useWrapper={useWrapper}
            onUseWrapperChange={setUseWrapper}
            showWrapper={!hasRegularDocs}
            generating={gen.generating}
            disabled={tpl.loading}
          />
        </section>

        <EmailPreview
          output={gen.output}
          setOutput={gen.setOutput}
          englishOutput={gen.englishOutput}
          setEnglishOutput={(text) => handleEnglishEdit(text)}
          error={gen.error}
          language={language}
          onLanguageChange={handleLanguageChange}
          translatingLanguage={translatingLanguage}
          activePreview={gen.activePreview}
          setActivePreview={gen.setActivePreview}
          placeholders={placeholders}
          placeholderValues={placeholderValues}
          onPlaceholderChange={updatePlaceholder}
          copyState={gen.copyState}
          onCopy={gen.copyText}
          lastPayload={gen.lastPayload}
          generating={gen.generating}
          onRegenerate={handleRegenerate}
          isTranslating={translationSync.isTranslating}
          onRefineSection={handleRefineSection}
          refiningIndex={refiningIndex}
          canUndoRefine={!!refineSnapshot}
          onUndoRefine={handleUndoRefine}
        />
      </form>

      {managerOpen && (
        <TemplateManager
          busy={tpl.busy}
          editingKey={tpl.editingKey}
          form={tpl.form}
          message={tpl.message}
          onClose={() => setManagerOpen(false)}
          onDelete={(t) => {
            tpl.remove(t);
            removeSelectedTemplate(t.key);
          }}
          onEdit={tpl.startEdit}
          onFormChange={tpl.updateForm}
          onNew={tpl.openNew}
          onSave={tpl.save}
          onOpenReferences={() => { setManagerOpen(false); setReferencesOpen(true); }}
          templates={tpl.templates}
        />
      )}

      {referencesOpen && (
        <ReferenceLibrary onClose={() => setReferencesOpen(false)} />
      )}
    </section>
  );
}
