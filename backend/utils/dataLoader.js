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

/** @type {Array<{name: string, iata: string, icao: string, country: string, reqs?: string, ticketNumberCanReplacePnr?: boolean, claimNote?: string, trackerSearchCodes?: {airportInfo?: string, flightStats?: string, flightera?: string}}>} */
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

/**
 * Looks up against airlines_codes.json using a 3-tier strategy:
 *   1. Exact IATA match
 *   2. Exact name match (accent-normalised)
 *   3. Airline name contains the query (min 4 chars)
 *
 * @param {string} airlineName
 * @returns {{name: string, iata: string, icao: string, country: string, reqs?: string, ticketNumberCanReplacePnr?: boolean, claimNote?: string}|undefined}
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
 *
 * @param {string} airlineName
 * @returns {{reqs: string, ticketNumberCanReplacePnr: boolean, claimNote: string, iata: string, icao: string, country: string}}
 */
function getAirlineDocInfo(airlineName) {
  const match = findAirlineDocRecord(airlineName);

  return {
    reqs: match?.reqs || 'No documents required',
    ticketNumberCanReplacePnr: !!match?.ticketNumberCanReplacePnr,
    claimNote: match?.claimNote || '',
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
};
