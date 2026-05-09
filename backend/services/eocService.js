'use strict';

const EocRecord = require('../models/EocRecord');

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

  const matchedEvents = [...exactMatches, ...ongoingMatches];
  return { eocFound: matchedEvents.length > 0, events: matchedEvents };
}

module.exports = { findEOCEvents };
