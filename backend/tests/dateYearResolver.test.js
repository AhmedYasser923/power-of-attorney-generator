'use strict';

const assert = require('node:assert/strict');
const { parseDateParts, resolveJourneyYears } = require('../utils/dateYearResolver');

function leg(rawExtractedDate, date, extra = {}) {
  return {
    rawExtractedDate,
    date,
    pnr: extra.pnr || 'ABC123',
    passengerTickets: extra.passengerTickets || [],
    ...extra
  };
}

function journey(legs, extra = {}) {
  return {
    passengers: extra.passengers || [{ firstName: 'Test', lastName: 'Passenger', ticketNumber: 'Not Provided' }],
    routes: [{ type: 'Outbound', legs }]
  };
}

{
  const journeys = [
    journey([
      leg('25 Mar 2025', '2025-03-25'),
      leg('27 Mar', '27 Mar')
    ])
  ];

  resolveJourneyYears(journeys, '');

  assert.equal(journeys[0].routes[0].legs[0].date, '2025-03-25');
  assert.equal(journeys[0].routes[0].legs[0].dateYearSource, 'document');
  assert.equal(journeys[0].routes[0].legs[1].date, '2025-03-27');
  assert.equal(journeys[0].routes[0].legs[1].dateYearSource, 'document-propagated');
}

{
  const journeys = [
    journey([
      leg('28 Dec', '28 Dec'),
      leg('04 Jan', '04 Jan')
    ])
  ];

  resolveJourneyYears(journeys, '2025');

  assert.equal(journeys[0].routes[0].legs[0].date, '2025-12-28');
  assert.equal(journeys[0].routes[0].legs[0].dateYearSource, 'user-input');
  assert.equal(journeys[0].routes[0].legs[1].date, '2026-01-04');
  assert.equal(journeys[0].routes[0].legs[1].dateYearSource, 'user-input');
}

{
  const journeys = [
    journey([
      leg('28 Dec', '28 Dec'),
      leg('04 Jan 2026', '2026-01-04')
    ])
  ];

  resolveJourneyYears(journeys, '');

  assert.equal(journeys[0].routes[0].legs[0].date, '2025-12-28');
  assert.equal(journeys[0].routes[0].legs[0].dateYearSource, 'document-propagated');
  assert.equal(journeys[0].routes[0].legs[1].date, '2026-01-04');
  assert.equal(journeys[0].routes[0].legs[1].dateYearSource, 'document');
}

{
  const journeys = [
    journey([
      leg('27 Mar', '27 Mar')
    ])
  ];

  resolveJourneyYears(journeys, '');

  assert.equal(journeys[0].routes[0].legs[0].date, '27 Mar');
  assert.equal(journeys[0].routes[0].legs[0].dateYearSource, 'unresolved');
  assert.equal(journeys[0].routes[0].legs[0].dateYearApplied, '');
}

{
  const journeys = [
    journey([
      leg('25 Mar 2024', '2024-03-25'),
      leg('27 Mar', '27 Mar')
    ])
  ];

  resolveJourneyYears(journeys, '2025');

  assert.equal(journeys[0].routes[0].legs[0].date, '2024-03-25');
  assert.equal(journeys[0].routes[0].legs[0].dateYearSource, 'document');
  assert.equal(journeys[0].routes[0].legs[1].date, '2024-03-27');
  assert.equal(journeys[0].routes[0].legs[1].dateYearSource, 'document-propagated');
}

{
  const journeys = [
    journey([
      leg('22 mars 2026', '22 mars 2026'),
      leg('23 mars 2026', '23 mars 2026')
    ])
  ];

  resolveJourneyYears(journeys, '');

  assert.equal(journeys[0].routes[0].legs[0].date, '2026-03-22');
  assert.equal(journeys[0].routes[0].legs[0].dateYearSource, 'document');
  assert.equal(journeys[0].routes[0].legs[1].date, '2026-03-23');
  assert.equal(journeys[0].routes[0].legs[1].dateYearSource, 'document');
}

{
  const journeys = [
    journey([
      leg('08 d\u00e9cembre 2025', '08 d\u00e9cembre 2025')
    ])
  ];

  resolveJourneyYears(journeys, '');

  assert.equal(journeys[0].routes[0].legs[0].date, '2025-12-08');
  assert.equal(journeys[0].routes[0].legs[0].dateYearSource, 'document');
}

{
  const journeys = [
    journey([
      leg('05/mar./2026', '05/mar./2026'),
      leg('10/Mar/2026', '10/Mar/2026')
    ])
  ];

  resolveJourneyYears(journeys, '');

  assert.equal(journeys[0].routes[0].legs[0].date, '2026-03-05');
  assert.equal(journeys[0].routes[0].legs[0].dateYearSource, 'document');
  assert.equal(journeys[0].routes[0].legs[1].date, '2026-03-10');
  assert.equal(journeys[0].routes[0].legs[1].dateYearSource, 'document');
}

{
  const journeys = [
    journey([
      leg('05/mar.', '05/mar.')
    ])
  ];

  resolveJourneyYears(journeys, '2026');

  assert.equal(journeys[0].routes[0].legs[0].date, '2026-03-05');
  assert.equal(journeys[0].routes[0].legs[0].dateYearSource, 'user-input');
}

{
  const journeys = [
    journey([
      leg('10/Mar/2026', '10/Mar/2026')
    ])
  ];

  resolveJourneyYears(journeys, '2025');

  assert.equal(journeys[0].routes[0].legs[0].date, '2026-03-10');
  assert.equal(journeys[0].routes[0].legs[0].dateYearSource, 'document');
}

{
  const journeys = [
    journey([
      leg('31/Feb/2026', '31/Feb/2026')
    ])
  ];

  resolveJourneyYears(journeys, '');

  assert.equal(parseDateParts('31/Feb/2026'), null);
  assert.equal(journeys[0].routes[0].legs[0].date, '31/Feb/2026');
  assert.equal(journeys[0].routes[0].legs[0].dateYearSource, 'unresolved');
}

console.log('dateYearResolver tests passed');
