export const LANGUAGES = [
  'English',
  'Spanish',
  'French',
  'German',
  'Italian',
  'Dutch',
  'Swedish',
  'Polish',
  'Portuguese',
  'Danish',
  'Norwegian',
  'Finnish',
  'Romanian',
  'Czech',
  'Hungarian',
  'Greek',
  'Turkish',
  'Arabic',
  'Hebrew',
  'Russian'
];

export const TYPE_ORDER = ['document-request', 'special-case', 'rejection'];

export const TYPE_LABELS = {
  'document-request': 'Document Request',
  'special-case': 'Special Case',
  'rejection': 'Rejection'
};

// Keep for backward compat during transition
export const CATEGORY_ORDER = ['Documents', 'Others', 'Rejection Reason'];

export function groupTemplates(templates) {
  const groups = templates.reduce((map, template) => {
    const groupKey = template.type || 'document-request';
    if (!map[groupKey]) map[groupKey] = [];
    map[groupKey].push(template);
    return map;
  }, {});

  const orderedKeys = TYPE_ORDER
    .filter((type) => groups[type])
    .concat(Object.keys(groups).filter((type) => !TYPE_ORDER.includes(type)).sort());

  return orderedKeys.map((type) => ({
    category: TYPE_LABELS[type] || type,
    type,
    templates: groups[type]
  }));
}

export function normalizePlaceholderName(name) {
  return String(name || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

export function toTitleCase(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getSelectedPlaceholders(templates, selectedTemplates) {
  const templateMap = new Map(templates.map((template) => [template.key, template.text || '']));
  const seen = new Map();

  selectedTemplates.forEach((key) => {
    const text = templateMap.get(key) || '';
    Array.from(text.matchAll(/\{([^}]+)\}/g)).forEach((match) => {
      const name = match[1].trim();
      if (!seen.has(name)) seen.set(name, toTitleCase(name));
    });
  });

  return Array.from(seen.entries()).map(([name, label]) => ({ name, label }));
}

export function getWordCount(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return 0;

  return trimmed.split(/\s+/).length;
}

export function deriveTemplatePayload(form) {
  const type = form.type || 'document-request';
  return {
    key: form.key.trim(),
    label: form.label.trim(),
    text: form.text.trim(),
    type,
    combineWithDocuments: type === 'special-case' ? !!form.combineWithDocuments : false
  };
}
