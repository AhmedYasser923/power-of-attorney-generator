'use strict';

const path = require('path');

let _records = [];
try {
  _records = require(path.join(__dirname, '../eoc_data.json'));
} catch (e) {
  console.warn('[eocStore] Could not load eoc_data.json at startup:', e.message);
}

function getRecords() { return _records; }
function setRecords(data) { _records = data; return _records.length; }

module.exports = { getRecords, setRecords };
