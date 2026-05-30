/**
 * dataLoader.js
 * -------------
 * Single source of truth for jurisdiction limits and airline document
 * requirements. Both ticketController.js and toolsController.js import
 * from here so there is no duplication.
 *
 * Data files:
 *   jurisdiction_data.json  – statute-of-limitations per country
 *   airlines_codes.json     – master airline database with optional reqs field
 */

'use strict';

const path = require('path');

// ---------------------------------------------------------------------------
// Load JSON files once at startup (synchronous – fine for module init)
// ---------------------------------------------------------------------------

/** @type {Array<{country: string, years: number|null, note?: string}>} */
const jurisdictionData = require(path.join(__dirname, '../jurisdiction_data.json'));

/** @type {Array<{name: string, iata: string, icao: string, country: string, reqs?: string, ticketPrefix?: string, ticketNumberCanReplacePnr?: boolean, claimNote?: string, oneTimeSubmission?: boolean, ceasedOperations?: boolean, trackerSearchCodes?: {airportInfo?: string, flightStats?: string, flightera?: string}}>} */
// The first entry of airlines_codes.json may be an in-file schema reference
// (`__schema: true`). Filter it out so consumers see only real airline rows.
const airlinesCodesData = require(path.join(__dirname, '../airlines_codes.json'))
  .filter(entry => entry && entry.__schema !== true);

// ---------------------------------------------------------------------------
// Build a fast lookup map: lowercase country name → raw limit value
// Mirrors the old hardcoded object format so no logic change is needed in
// the controllers.
// ---------------------------------------------------------------------------

/**
 * Returns the raw limit value for a country exactly as the controllers
 * expect it:
 *   - a plain number  (e.g. 3)  for straightforward year limits
 *   - the note string           for special cases like "2 Months - 10"
 *   - 'N/A'                     when the country isn't in the database
 *
 * @param {string} country
 * @returns {number|string}
 */
function getJurisdictionLimit(country) {
  if (!country) return 'N/A';

  const key = country.toLowerCase().trim();
  const entry = jurisdictionData.find(j => j.country === key);

  if (!entry) return 'N/A';

  // "No Limit" countries (e.g. Malta) have years: null and a note
  if (entry.years === null) return entry.note || 'No Limit';

  // Special display strings (e.g. Sweden "2 Months - 10", Czech "6 Months - 3")
  // are stored in `note` but the numeric `years` value is used for date maths.
  // We return the note string to preserve the original display behaviour.
  if (entry.note) return entry.note;

  return entry.years;
}

/**
 * Returns the raw numeric year value for expiration date calculations.
 * Unlike getJurisdictionLimit() this always returns a number or null.
 *
 * @param {string} country
 * @returns {number|null}
 */
function getJurisdictionYears(country) {
  if (!country) return null;

  const key = country.toLowerCase().trim();
  const entry = jurisdictionData.find(j => j.country === key);

  return entry ? entry.years : null; // null for "No Limit" or missing
}

// ---------------------------------------------------------------------------
// Airline document requirements lookup
// ---------------------------------------------------------------------------

function normalizeAirline(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Aggressive comparison form: drops every non-alphanumeric char so spacing /
// punctuation differences don't kill matches. "Delta Air Lines" vs
// "Delta AirLines" both collapse to "deltaairlines".
function collapseAirline(s) {
  return normalizeAirline(s).replace(/[^a-z0-9]/g, '');
}

// Pre-built index from IATA -> all matching airline records. IATA collisions
// (e.g. PU = Plus Ultra + PLUNA, D8 = Norwegian Air Sweden + Norwegian Air
// Shuttle) produce multi-element arrays; the context-aware lookup below
// disambiguates them by airline name + country.
const airlinesByIata = (() => {
  const map = new Map();
  for (const a of airlinesCodesData) {
    if (!a.iata || a.iata.toLowerCase() === 'na') continue;
    const key = a.iata.toUpperCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(a);
  }
  return map;
})();

function extractIataCandidates(flightNumbers) {
  if (!Array.isArray(flightNumbers)) return [];
  const seen = new Set();
  for (const fn of flightNumbers) {
    const m = String(fn || '').trim().match(/^([A-Za-z]{3}|[A-Za-z0-9]{2})\d+$/);
    if (m) seen.add(m[1].toUpperCase());
  }
  return Array.from(seen);
}

/**
 * Looks up against airlines_codes.json using a 3-tier strategy:
 *   1. Exact IATA match
 *   2. Exact name match (accent-normalised)
 *   3. Airline name contains the query (min 4 chars)
 *
 * @param {string} airlineName
 * @returns {{name: string, iata: string, icao: string, country: string, reqs?: string, ticketPrefix?: string, ticketNumberCanReplacePnr?: boolean, claimNote?: string, oneTimeSubmission?: boolean, ceasedOperations?: boolean}|undefined}
 */
function findAirlineDocRecord(airlineName) {
  if (!airlineName || airlineName === 'Unknown') return undefined;

  const q = normalizeAirline(airlineName);

  // 1. Exact IATA match (ignore 'NA' placeholder)
  let match = airlinesCodesData.find(a =>
    a.iata && a.iata.toLowerCase() !== 'na' && a.iata.toLowerCase() === q
  );

  // 2. Exact name match (accent-normalised)
  if (!match) match = airlinesCodesData.find(a => normalizeAirline(a.name) === q);

  // 3. Partial: airline name contains the query
  if (!match && q.length >= 4)
    match = airlinesCodesData.find(a => normalizeAirline(a.name).includes(q));

  return match;
}

/**
 * Context-aware airline-record lookup for the ticket analyzer. Uses every
 * IATA prefix parsed from the leg's flight numbers as primary keys, scores
 * each candidate JSON row against the airline name (and optional country),
 * and returns the highest-scoring record. Falls back to the legacy
 * name-only `findAirlineDocRecord` when no IATA candidate aligns — which is
 * the case for codeshare/interline legs where the operating airline is
 * mentioned by name only without its own flight number.
 *
 * Scoring per (IATA, candidate) pair:
 *   exact normalized-name match -> 100
 *   one name fully contains the other (shorter side >= 4 chars) -> 40
 *   otherwise -> 0
 *   +5 when the candidate's country matches the supplied country
 *
 * @param {{name?: string, flightNumbers?: string[], country?: string}} args
 * @returns {object|undefined}
 */
function findAirlineDocByContext({ name, flightNumbers, country } = {}) {
  if (!name || name === 'Unknown') return undefined;

  const target = collapseAirline(name);
  const wantedCountry = (country || '').toLowerCase().trim();
  const iataCandidates = extractIataCandidates(flightNumbers);
  if (iataCandidates.length === 0) return findAirlineDocRecord(name);

  let best = null;
  let bestScore = 0;

  for (const iata of iataCandidates) {
    const rows = airlinesByIata.get(iata);
    if (!rows) continue;
    for (const row of rows) {
      const cName = collapseAirline(row.name);
      let score = 0;
      if (cName === target) {
        score = 100;
      } else {
        const shorter = cName.length <= target.length ? cName : target;
        const longer  = cName.length <= target.length ? target : cName;
        if (shorter.length >= 4 && longer.includes(shorter)) score = 40;
      }
      if (score > 0 && wantedCountry && row.country &&
          row.country.toLowerCase().trim() === wantedCountry) {
        score += 5;
      }
      if (score > bestScore) {
        bestScore = score;
        best = row;
      }
    }
  }

  return best || findAirlineDocRecord(name);
}

/**
 * Returns the document requirements string for a given airline name or IATA
 * code, or a default string if no specific requirements are recorded.
 *
 * @param {string} airlineName
 * @returns {string}
 */
function getAirlineReqs(airlineName) {
  const match = findAirlineDocRecord(airlineName);
  return match?.reqs || 'No documents required';
}

/**
 * Returns all document-check metadata for a given airline name or IATA code.
 * When `options.flightNumbers` is provided, the lookup uses the context-aware
 * matcher that disambiguates IATA collisions (e.g. Plus Ultra vs PLUNA) and
 * survives airline-name variants by anchoring on the flight number's IATA
 * prefix. Without `flightNumbers`, behaves exactly like the legacy
 * name-only matcher (preserves Document Check page behavior).
 *
 * @param {string} airlineName
 * @param {{flightNumbers?: string[], country?: string}} [options]
 * @returns {{reqs: string, ticketPrefix: string, ticketNumberCanReplacePnr: boolean, claimNote: string, oneTimeSubmission: boolean, ceasedOperations: boolean, iata: string, icao: string, country: string}}
 */
function getAirlineDocInfo(airlineName, options) {
  const match = options && options.flightNumbers
    ? findAirlineDocByContext({ name: airlineName, flightNumbers: options.flightNumbers, country: options.country })
    : findAirlineDocRecord(airlineName);

  return {
    reqs: match?.reqs || 'No documents required',
    ticketPrefix: match?.ticketPrefix || '',
    ticketNumberCanReplacePnr: !!match?.ticketNumberCanReplacePnr,
    claimNote: match?.claimNote || '',
    oneTimeSubmission: !!match?.oneTimeSubmission,
    ceasedOperations: !!match?.ceasedOperations,
    iata: match?.iata && match.iata.toLowerCase() !== 'na' ? match.iata : '',
    icao: match?.icao && match.icao.toLowerCase() !== 'na' ? match.icao : '',
    country: match?.country || '',
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  jurisdictionData,
  airlinesCodesData,
  getJurisdictionLimit,
  getJurisdictionYears,
  getAirlineReqs,
  getAirlineDocInfo,
  findAirlineDocByContext,
};
