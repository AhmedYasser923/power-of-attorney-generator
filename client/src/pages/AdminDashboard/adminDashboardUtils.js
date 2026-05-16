export const EGYPT_OFFSET_MS = 2 * 60 * 60 * 1000;

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

export const OP_LABELS = {
  ticket_analysis: 'Ticket Analysis',
  email_builder: 'Email Builder',
  email_translation: 'Email Translation',
  email_translation_sync: 'Email Translation Sync',
  email_refinement: 'Email Refinement',
  poa_standard: 'POA (Standard)',
  poa_lufthansa: 'POA (Lufthansa)',
  poa_aerlingus: 'POA (Aer Lingus)',
  text_autofill: 'Text Autofill',
  barcode_decode: 'Barcode Decode',
  sig_processing: 'Signature Processing'
};

export function getEgyptDateParts(date = new Date()) {
  const egyptDate = new Date(date.getTime() + EGYPT_OFFSET_MS);

  return {
    year: egyptDate.getUTCFullYear(),
    month: egyptDate.getUTCMonth() + 1,
    day: egyptDate.getUTCDate()
  };
}

export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function ceilCurrency(value) {
  const numeric = Number(value) || 0;

  if (numeric <= 0) return '0.00';

  return (Math.ceil(numeric * 100) / 100).toFixed(2);
}

export function formatDate(value) {
  if (!value) return '-';

  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export function formatDateTime(value) {
  if (!value) return '-';

  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Cairo'
  });
}

export function formatOperationLabel(log) {
  return log.label || OP_LABELS[log.operationType] || log.operationType || '-';
}

export function capitalize(value) {
  const text = String(value || '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function buildMonthOptions(selectedYear, selectedMonth, monthlyTotals = []) {
  const options = [];
  const seen = new Set();
  const add = (year, month) => {
    const key = `${year}-${month}`;
    if (seen.has(key) || !year || !month) return;
    seen.add(key);
    options.push({
      year,
      month,
      label: `${MONTH_NAMES[month - 1]} ${year}`
    });
  };

  add(selectedYear, selectedMonth);

  monthlyTotals
    .map((item) => item._id || item)
    .sort((a, b) => (b.year - a.year) || (b.month - a.month))
    .forEach((item) => add(item.year, item.month));

  const today = getEgyptDateParts();
  for (let index = 0; index < 12; index += 1) {
    const date = new Date(Date.UTC(today.year, today.month - 1 - index, 1));
    add(date.getUTCFullYear(), date.getUTCMonth() + 1);
  }

  return options;
}

export function getUserId(value) {
  return String(value?._id?.userId || value?.userId || value?._id || '');
}
