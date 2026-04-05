/**
 * dataLoader.js
 * -------------
 * Single source of truth for jurisdiction limits and airline document
 * requirements. Both ticketController.js and toolsController.js import
 * from here so there is no duplication.
 *
 * Data files:
 *   jurisdiction_data.json  – statute-of-limitations per country
 *   airline_docs_data.json  – required claim documents per airline
 */

'use strict';

const path = require('path');

// ---------------------------------------------------------------------------
// Load JSON files once at startup (synchronous – fine for module init)
// ---------------------------------------------------------------------------

/** @type {Array<{country: string, years: number|null, note?: string}>} */
const jurisdictionData = require(path.join(__dirname, '../jurisdiction_data.json'));

/** @type {Array<{names: string[], reqs: string}>} */
const airlineDocsData = require(path.join(__dirname, '../airline_docs_data.json'));

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

/**
 * Returns the document requirements string for a given airline name or IATA
 * code, or a default string if no specific requirements are recorded.
 *
 * @param {string} airlineName
 * @returns {string}
 */
function getAirlineReqs(airlineName) {
  if (!airlineName || airlineName === 'Unknown') {
    return 'No documents required';
  }

  const normalized = airlineName.toLowerCase().trim();

  for (const item of airlineDocsData) {
    if (item.names.some(keyword =>
      new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(normalized)
    )) {
      return item.reqs;
    }
  }

  return 'No documents required';
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  jurisdictionData,
  airlineDocsData,
  getJurisdictionLimit,
  getJurisdictionYears,
  getAirlineReqs,
};