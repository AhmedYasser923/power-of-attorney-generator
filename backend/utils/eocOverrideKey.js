'use strict';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeEocKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildOngoingOverrideKey(event) {
  const startDate = String(event?.startDate || event?.date || '').trim();
  const location = String(event?.location || '').trim();
  const eventText = String(event?.event || '').trim();
  const decision = String(event?.decision || '').trim() || 'REJECT';

  return {
    startDate,
    locationKey: normalizeEocKey(location),
    eventKey: normalizeEocKey(eventText),
    decisionKey: normalizeEocKey(decision)
  };
}

function buildOngoingOverrideDocument(event) {
  const startDate = String(event?.startDate || event?.date || '').trim();
  const location = String(event?.location || '').trim();
  const eventText = String(event?.event || '').trim();
  const decision = String(event?.decision || '').trim() || 'REJECT';

  return {
    ...buildOngoingOverrideKey({ startDate, location, event: eventText, decision }),
    startDate,
    location,
    event: eventText,
    decision
  };
}

function isValidYmd(value) {
  return YMD_RE.test(String(value || '').trim());
}

module.exports = {
  buildOngoingOverrideDocument,
  buildOngoingOverrideKey,
  isValidYmd,
  normalizeEocKey
};
