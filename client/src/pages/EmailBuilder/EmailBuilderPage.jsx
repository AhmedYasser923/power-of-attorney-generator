import { useCallback, useEffect, useMemo, useState } from 'react';
import { refineEmailSection } from '../../api/emailBuilder.js';
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
  const [link, setLink] = useState('');
  const [useNote, setUseNote] = useState(false);
  const [customNote, setCustomNote] = useState('');
  const [useWrapper, setUseWrapper] = useState(false);
  const [language, setLanguage] = useState(() => localStorage.getItem('emLastLanguage') || 'English');
  const [managerOpen, setManagerOpen] = useState(false);
  const [referencesOpen, setReferencesOpen] = useState(false);
  const [refiningIndex, setRefiningIndex] = useState(-1);
  const [userSectionIndices, setUserSectionIndices] = useState(new Set());

  const translationSync = useTranslationSync(language);

  useEffect(() => {
    localStorage.setItem('emLastLanguage', language);
    if (language === 'English' && gen.activePreview === 'verify') {
      gen.setActivePreview('output');
    }
  }, [language, gen.activePreview]);

  useEffect(() => () => gen.cleanup(), [gen.cleanup]);

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

      // Mutual exclusivity: rejection deselects all others and vice versa
      if (toggled.type === 'rejection') return [key];

      // Selecting a non-rejection deselects any rejection
      const withoutRejections = curr.filter((k) => {
        const t = tpl.templates.find((item) => item.key === k);
        return t?.type !== 'rejection';
      });

      // Standalone special-case (non-combinable) is also exclusive
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
    setUserSectionIndices(new Set());
  }, [gen, tpl.templates]);

  const updatePlaceholder = useCallback((name, value) => {
    setPlaceholderValues((curr) => ({ ...curr, [name]: value }));
    gen.setOutput('');
    gen.setEnglishOutput('');
  }, [gen]);

  const buildPayload = useCallback(() => ({
    mode: 'request',
    language,
    selectedTemplates,
    link: link.trim(),
    customNote: useNote ? customNote.trim() : '',
    useWrapper,
    placeholderValues
  }), [language, selectedTemplates, link, useNote, customNote, useWrapper, placeholderValues]);

  const submit = useCallback((e) => {
    e.preventDefault();
    setUserSectionIndices(new Set());
    gen.submitPayload(buildPayload(), {
      resetCallback: () => {
        setSelectedTemplates([]);
        setPlaceholderValues({});
        setLink('');
        setUseNote(false);
        setCustomNote('');
        setUseWrapper(false);
      }
    });
  }, [buildPayload, gen]);

  const handleEnglishEdit = useCallback((text) => {
    gen.setEnglishOutput(text);
    if (language === 'English') {
      gen.setOutput(text);
    } else {
      translationSync.translate(text, (translated) => gen.setOutput(translated));
    }
  }, [language, gen, translationSync]);

  const handleRefineSection = useCallback(async (index, sectionText) => {
    if (!sectionText?.trim()) return;
    setRefiningIndex(index);

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
      }
    } catch (err) {
      gen.setError(err.message || 'Refinement failed.');
    } finally {
      setRefiningIndex(-1);
    }
  }, [gen, language]);

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
            link={link}
            onLinkChange={setLink}
            useNote={useNote}
            onUseNoteChange={setUseNote}
            customNote={customNote}
            onCustomNoteChange={setCustomNote}
            useWrapper={useWrapper}
            onUseWrapperChange={setUseWrapper}
            showWrapper={!hasRegularDocs}
            language={language}
            onLanguageChange={setLanguage}
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
          activePreview={gen.activePreview}
          setActivePreview={gen.setActivePreview}
          placeholders={placeholders}
          placeholderValues={placeholderValues}
          onPlaceholderChange={updatePlaceholder}
          copyState={gen.copyState}
          onCopy={gen.copyText}
          lastPayload={gen.lastPayload}
          generating={gen.generating}
          onRegenerate={gen.regenerate}
          isTranslating={translationSync.isTranslating}
          onRefineSection={handleRefineSection}
          refiningIndex={refiningIndex}
          userSectionIndices={userSectionIndices}
          setUserSectionIndices={setUserSectionIndices}
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
