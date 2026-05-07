import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteEmailTemplate,
  getEmailTemplates,
  saveEmailTemplate
} from '../../../api/emailBuilder.js';
import { deriveTemplatePayload } from '../emailBuilderUtils.js';

const EMPTY_FORM = { key: '', label: '', type: 'document-request', text: '', combineWithDocuments: false };

export default function useEmailTemplates() {
  const loadAbortRef = useRef(null);
  const crudAbortRef = useRef(null);

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [editingKey, setEditingKey] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;

    getEmailTemplates({ signal: controller.signal })
      .then((data) => setTemplates(data.templates || []))
      .catch((err) => {
        if (err.name !== 'AbortError') setMessage('Failed to load email templates.');
      })
      .finally(() => {
        if (loadAbortRef.current === controller) setLoading(false);
      });

    return () => {
      loadAbortRef.current?.abort();
      crudAbortRef.current?.abort();
    };
  }, []);

  const openNew = useCallback(() => {
    setMessage('');
    setEditingKey('__new__');
    setForm(EMPTY_FORM);
  }, []);

  const startEdit = useCallback((template) => {
    setMessage('');
    if (!template) {
      setEditingKey(null);
      setForm(EMPTY_FORM);
      return;
    }
    setEditingKey(template.key);
    setForm({
      key: template.key || '',
      label: template.label || '',
      type: template.type || 'document-request',
      text: template.text || '',
      combineWithDocuments: !!template.combineWithDocuments
    });
  }, []);

  const updateForm = useCallback((patch) => {
    setForm((current) => {
      const next = { ...current, ...patch };
      if (patch.label !== undefined && !current.key && current._isNew) {
        next.key = patch.label;
      } else {
        next.key = patch.key ?? current.key;
      }
      return next;
    });
  }, []);

  const save = useCallback(async (e) => {
    e.preventDefault();
    setMessage('');

    const payload = deriveTemplatePayload(form);
    if (!payload.key || !payload.label || !payload.text || !payload.type) {
      setMessage('Label, key, type, and template text are required.');
      return;
    }

    crudAbortRef.current?.abort();
    const controller = new AbortController();
    crudAbortRef.current = controller;
    setBusy(true);

    try {
      const data = await saveEmailTemplate({
        template: payload,
        isNew: editingKey === '__new__',
        signal: controller.signal
      });
      setTemplates(data.templates || []);
      setEditingKey(null);
      setForm(EMPTY_FORM);
      setMessage('Template saved.');
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessage(err.message || 'Template save failed.');
      }
    } finally {
      if (crudAbortRef.current === controller) setBusy(false);
    }
  }, [editingKey, form]);

  const remove = useCallback(async (template) => {
    if (!window.confirm(`Delete "${template.label || template.key}"? This cannot be undone.`)) return;

    crudAbortRef.current?.abort();
    const controller = new AbortController();
    crudAbortRef.current = controller;
    setBusy(true);
    setMessage('');

    try {
      const data = await deleteEmailTemplate({ key: template.key, signal: controller.signal });
      setTemplates(data.templates || []);
      setMessage('Template deleted.');
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessage(err.message || 'Template delete failed.');
      }
    } finally {
      if (crudAbortRef.current === controller) setBusy(false);
    }
  }, []);

  return {
    templates,
    setTemplates,
    loading,
    busy,
    message,
    editingKey,
    form,
    openNew,
    startEdit,
    updateForm,
    save,
    remove
  };
}
