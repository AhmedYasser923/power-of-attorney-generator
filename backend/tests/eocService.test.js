'use strict';

const assert = require('node:assert/strict');
const { applyOngoingOverrides, decorateOngoingRecords } = require('../services/eocService');

const ongoingRecord = {
  category: 'Ongoing Issues',
  date: '2026-01-01',
  location: 'mad',
  event: 'Airport staff strike',
  decision: 'REJECT'
};

{
  const [match] = applyOngoingOverrides([ongoingRecord], [], '2026-03-01');

  assert.equal(match.location, 'mad');
  assert.equal(match.lifecycle.status, 'active');
  assert.equal(match.lifecycle.endDate, '');
}

{
  const [match] = applyOngoingOverrides([ongoingRecord], [{
    startDate: '2026-01-01',
    location: 'mad',
    event: 'Airport staff strike',
    decision: 'REJECT',
    endDate: '2026-01-20',
    note: 'Resolved by airport notice'
  }], '2026-01-20');

  assert.equal(match.lifecycle.status, 'closed');
  assert.equal(match.lifecycle.endDate, '2026-01-20');
  assert.equal(match.lifecycle.note, 'Resolved by airport notice');
}

{
  const matches = applyOngoingOverrides([ongoingRecord], [{
    startDate: '2026-01-01',
    location: 'mad',
    event: 'Airport staff strike',
    decision: 'REJECT',
    endDate: '2026-01-20'
  }], '2026-01-21');

  assert.equal(matches.length, 0);
}

{
  const [match] = decorateOngoingRecords([ongoingRecord], [{
    startDate: '2026-01-01',
    location: 'mad',
    event: 'Airport staff strike',
    decision: 'REJECT',
    endDate: '2026-01-20',
    note: 'Resolved by airport notice',
    closedByName: 'Operations'
  }]);

  assert.equal(match.lifecycle.status, 'closed');
  assert.equal(match.lifecycle.endDate, '2026-01-20');
  assert.equal(match.lifecycle.closedByName, 'Operations');
}

console.log('eocService tests passed');
