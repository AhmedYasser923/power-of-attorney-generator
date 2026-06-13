'use strict';

const assert = require('node:assert/strict');
const { buildClaimDocuments, extractFlightIata } = require('../utils/claimDocuments');

function leg(overrides = {}) {
  return {
    marketingAirline: 'Etihad Airways',
    marketingAirlineCountry: 'United Arab Emirates',
    operatingAirline: 'Etihad Airways',
    operatingAirlineCountry: 'United Arab Emirates',
    flightNumbers: ['EY403'],
    isCodeshare: false,
    ...overrides
  };
}

{
  assert.equal(extractFlightIata('EY403'), 'EY');
  assert.equal(extractFlightIata('AZ1681'), 'AZ');
  assert.equal(extractFlightIata('EY 403'), 'EY');
  assert.equal(extractFlightIata('not-a-flight'), '');
}

{
  const docs = buildClaimDocuments(leg({
    flightNumbers: ['EY403', 'EY83', 'AZ1681']
  }));

  assert.deepEqual(docs.map((doc) => doc.iata), ['EY', 'AZ']);
  assert.equal(docs[0].airline, 'Etihad Airways');
  assert.equal(docs[1].airline, 'ITA Airways');
  assert.equal(docs[1].role, '');
  assert.equal(docs[1].reqs, 'Ticket number');
  assert.equal(docs[1].claimNote, 'Ticket number and PNR mandatory');
}

{
  const docs = buildClaimDocuments(leg({
    marketingAirline: 'ITA Airways',
    marketingAirlineCountry: 'Italy',
    operatingAirline: 'ITA Airways',
    operatingAirlineCountry: 'Italy',
    flightNumbers: ['AZ1682', 'EY84', 'EY406']
  }));

  assert.deepEqual(docs.map((doc) => doc.iata), ['AZ', 'EY']);
  assert.deepEqual(docs.map((doc) => doc.role), ['', '']);
  assert.equal(docs[1].airline, 'Etihad Airways');
}

{
  const docs = buildClaimDocuments(leg({
    marketingAirline: 'Wizz Air Malta',
    marketingAirlineCountry: 'Malta',
    operatingAirline: 'Wizz Air Malta',
    operatingAirlineCountry: 'Malta',
    flightNumbers: ['W43268']
  }));

  assert.equal(docs.length, 1);
  assert.equal(docs[0].airline, 'Wizz Air Malta');
  assert.equal(docs[0].role, '');
  assert.equal(docs[0].iata, 'W4');
  assert.equal(docs[0].reqs, 'Wizz Air Denied Boarding Compensation Form');
}

{
  const docs = buildClaimDocuments(leg({
    marketingAirline: 'British Airways',
    marketingAirlineCountry: 'United Kingdom',
    operatingAirline: 'American Airlines',
    operatingAirlineCountry: 'United States',
    flightNumbers: ['BA1504']
  }));

  assert.equal(docs.length, 2);
  assert.deepEqual(docs.map((doc) => doc.role), ['Booked', 'Operated']);
  assert.deepEqual(docs.map((doc) => doc.airline), ['British Airways', 'American Airlines']);
}

{
  const docs = buildClaimDocuments(leg({
    flightNumbers: ['EY403', 'EY83']
  }));

  assert.deepEqual(docs.map((doc) => doc.iata), ['EY']);
}

{
  const docs = buildClaimDocuments(leg({
    flightNumbers: ['EY403', 'AZ1681'],
    isCodeshare: true
  }));

  assert.deepEqual(docs.map((doc) => doc.iata), ['EY']);
}

{
  const docs = buildClaimDocuments(leg({
    flightNumbers: ['EY403', 'ZZ123']
  }));

  assert.deepEqual(docs.map((doc) => doc.iata), ['EY']);
}

console.log('claimDocuments tests passed');
