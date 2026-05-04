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
  'Arabic'
];

export const CATEGORY_ORDER = ['Documents', 'Others', 'Rejection Reason'];

export function groupTemplates(templates) {
  const groups = templates.reduce((map, template) => {
    const category = template.category || 'Documents';
    if (!map[category]) map[category] = [];
    map[category].push(template);
    return map;
  }, {});

  const categories = CATEGORY_ORDER
    .filter((category) => groups[category])
    .concat(Object.keys(groups).filter((category) => !CATEGORY_ORDER.includes(category)).sort());

  return categories.map((category) => ({
    category,
    templates: groups[category]
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
  const category = form.category || 'Documents';
  const isRejection = category === 'Rejection Reason';

  return {
    key: form.key.trim(),
    label: form.label.trim(),
    text: form.text.trim(),
    category,
    type: isRejection ? 'rejection' : 'document',
    isInfoOnly: !isRejection && category === 'Others',
    noWrapper: !isRejection && category === 'Others'
  };
}
