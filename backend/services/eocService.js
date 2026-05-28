'use strict';

const EocRecord = require('../models/EocRecord');
const EocOngoingOverride = require('../models/EocOngoingOverride');
const { buildOngoingOverrideKey } = require('../utils/eocOverrideKey');

const DEFAULT_LIST_LIMIT = 40;
const MAX_LIST_LIMIT = 100;

function keyToString(key) {
  return [
    key.startDate,
    key.locationKey,
    key.eventKey,
    key.decisionKey
  ].join('|');
}

function lifecycleFor(record, override) {
  const endDate = override?.endDate || '';

  return {
    startDate: record.date,
    endDate,
    status: endDate ? 'closed' : 'active',
    note: override?.note || '',
    closedAt: override?.closedAt || null,
    closedByName: override?.closedByName || '',
    reopenedAt: override?.reopenedAt || null,
  };
}

function applyOngoingOverrides(records, overrides, flightDate) {
  if (!Array.isArray(records) || records.length === 0) return [];

  const overrideMap = new Map(
    (overrides || []).map((override) => [
      keyToString(buildOngoingOverrideKey(override)),
      override
    ])
  );

  return records
    .map((record) => {
      const override = overrideMap.get(keyToString(buildOngoingOverrideKey(record)));
      const lifecycle = lifecycleFor(record, override);

      return {
        ...record,
        lifecycle,
        startDate: record.date,
        endDate: lifecycle.endDate,
      };
    })
    .filter((record) => !record.endDate || flightDate <= record.endDate);
}

function decorateOngoingRecords(records, overrides) {
  if (!Array.isArray(records) || records.length === 0) return [];

  const overrideMap = new Map(
    (overrides || []).map((override) => [
      keyToString(buildOngoingOverrideKey(override)),
      override
    ])
  );

  return records.map((record) => {
    if (!/ongoing/i.test(String(record.category || ''))) return record;

    const override = overrideMap.get(keyToString(buildOngoingOverrideKey(record)));
    const lifecycle = lifecycleFor(record, override);

    return {
      ...record,
      lifecycle,
      startDate: record.date,
      endDate: lifecycle.endDate,
    };
  });
}

async function getOverridesForOngoingRecords(records) {
  const filters = (records || [])
    .map(buildOngoingOverrideKey)
    .filter((key) => key.startDate && key.locationKey && key.eventKey && key.decisionKey);

  if (filters.length === 0) return [];

  return EocOngoingOverride.find({ $or: filters }).lean();
}

function parseListCursor(cursor) {
  const raw = String(cursor || '').trim();
  if (!raw) return null;

  const [date, id] = raw.split('|');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[a-f\d]{24}$/i.test(id)) return null;

  return { date, id };
}

function buildListCursor(record) {
  if (!record?.date || !record?._id) return '';
  return `${record.date}|${record._id}`;
}

async function listEOCRecords({ cursor, limit } = {}) {
  const parsedLimit = Number.parseInt(limit, 10);
  const pageLimit = Math.min(
    Math.max(Number.isNaN(parsedLimit) ? DEFAULT_LIST_LIMIT : parsedLimit, 1),
    MAX_LIST_LIMIT
  );
  const parsedCursor = parseListCursor(cursor);
  const query = {};

  if (parsedCursor) {
    query.$or = [
      { date: { $lt: parsedCursor.date } },
      { date: parsedCursor.date, _id: { $lt: parsedCursor.id } }
    ];
  }

  const records = await EocRecord.find(query)
    .sort({ date: -1, _id: -1 })
    .limit(pageLimit + 1)
    .lean();

  const hasMore = records.length > pageLimit;
  const pageRecords = records.slice(0, pageLimit);
  const ongoingRecords = pageRecords.filter((record) => /ongoing/i.test(String(record.category || '')));
  const overrides = await getOverridesForOngoingRecords(ongoingRecords);
  const items = decorateOngoingRecords(pageRecords, overrides);

  return {
    items,
    nextCursor: hasMore ? buildListCursor(pageRecords[pageRecords.length - 1]) : '',
    hasMore,
  };
}

async function findEOCEvents({ date, originIata, destIata, originCountry, destCountry }) {
  if (!date || date === 'Unknown') return { eocFound: false };

  const oIata    = (originIata    || '').toLowerCase();
  const dIata    = (destIata      || '').toLowerCase();
  const oCountry = (originCountry || '').toLowerCase();
  const dCountry = (destCountry   || '').toLowerCase();

  const locs = [oIata, dIata, oCountry, dCountry, 'world wide']
    .filter(v => v && v.trim());

  const escaped = locs.map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const locRegex = new RegExp('^(' + escaped.join('|') + ')$', 'i');

  const [exactMatches, ongoingMatches] = await Promise.all([
    EocRecord.find({
      category: { $not: /ongoing/i },
      location: locRegex,
      date: date,
    }).lean(),
    EocRecord.find({
      category: /ongoing/i,
      location: locRegex,
      date: { $lte: date },
    }).lean(),
  ]);

  const overrides = await getOverridesForOngoingRecords(ongoingMatches);
  const activeOngoingMatches = applyOngoingOverrides(ongoingMatches, overrides, date);
  const matchedEvents = [...exactMatches, ...activeOngoingMatches];
  return { eocFound: matchedEvents.length > 0, events: matchedEvents };
}

module.exports = {
  applyOngoingOverrides,
  decorateOngoingRecords,
  listEOCRecords,
  findEOCEvents
};
