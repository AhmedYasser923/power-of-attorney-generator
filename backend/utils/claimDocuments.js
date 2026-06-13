'use strict';

const {
  getAirlineDocInfo,
  getJurisdictionLimit,
} = require('./dataLoader');

const FLIGHT_NUMBER_RE = /^([A-Za-z]{3}|[A-Za-z0-9]{2})\d+$/;

function hasDocumentRequirement(info) {
  const reqs = String(info?.reqs || '').trim().toLowerCase();
  return Boolean(
    reqs && reqs !== 'no documents required' ||
    info?.ticketNumberCanReplacePnr ||
    info?.claimNote ||
    info?.oneTimeSubmission ||
    info?.ceasedOperations
  );
}

function formatLimit(limit) {
  return limit !== 'N/A' ? `${limit} years` : 'N/A';
}

function displayCountry(country) {
  return country && country !== 'Unknown' ? country : 'Unknown HQ';
}

function makeClaimDocument({ airline, role, info, hq, limit }) {
  return {
    airline,
    role,
    reqs: info.reqs,
    hq,
    limit,
    iata: info.iata,
    icao: info.icao,
    ticketPrefix: info.ticketPrefix,
    ticketNumberCanReplacePnr: info.ticketNumberCanReplacePnr,
    claimNote: info.claimNote,
    oneTimeSubmission: info.oneTimeSubmission,
    ceasedOperations: info.ceasedOperations,
  };
}

function claimDocumentKey(document) {
  const iata = String(document?.iata || '').trim().toUpperCase();
  if (iata) return `iata:${iata}`;

  return `airline:${String(document?.airline || '').trim().toLowerCase()}`;
}

function extractFlightIata(flightNumber) {
  const match = String(flightNumber || '').replace(/[\s-]/g, '').trim().match(FLIGHT_NUMBER_RE);
  return match ? match[1].toUpperCase() : '';
}

function appendStopoverDocuments(documents, leg) {
  if (!Array.isArray(leg.flightNumbers) || leg.flightNumbers.length <= 1 || leg.isCodeshare) {
    return documents;
  }

  const seen = new Set(documents.map(claimDocumentKey));
  const stopoverSeen = new Set();

  leg.flightNumbers.forEach((flightNumber, index) => {
    const cleanedFlightNumber = String(flightNumber || '').replace(/[\s-]/g, '').trim().toUpperCase();
    const iata = extractFlightIata(cleanedFlightNumber);
    if (!iata || stopoverSeen.has(iata)) return;

    stopoverSeen.add(iata);

    const info = getAirlineDocInfo(iata);
    if (!info.iata || seen.has(`iata:${info.iata.toUpperCase()}`) || !hasDocumentRequirement(info)) return;

    const limitRaw = getJurisdictionLimit((info.country || '').toLowerCase().trim());
    const document = makeClaimDocument({
      airline: info.name || iata,
      role: '',
      info,
      hq: displayCountry(info.country),
      limit: formatLimit(limitRaw),
    });

    documents.push(document);
    seen.add(claimDocumentKey(document));
  });

  return documents;
}

function buildClaimDocuments(leg) {
  const marketing = leg.marketingAirline || 'Unknown';
  const operating = leg.operatingAirline || marketing;
  const opCo = (leg.operatingAirlineCountry || '').toLowerCase().trim();
  const mktCo = (leg.marketingAirlineCountry || '').toLowerCase().trim();
  const opLimRaw = getJurisdictionLimit(opCo);
  const mktLimRaw = getJurisdictionLimit(mktCo);
  const dispOp = displayCountry(leg.operatingAirlineCountry);
  const dispMkt = displayCountry(leg.marketingAirlineCountry);

  const mktInfo = getAirlineDocInfo(marketing, {
    flightNumbers: leg.flightNumbers,
    country: leg.marketingAirlineCountry,
  });
  const opInfo = getAirlineDocInfo(operating, {
    flightNumbers: leg.flightNumbers,
    country: leg.operatingAirlineCountry,
  });

  const documents = marketing === operating
    ? [makeClaimDocument({
        airline: marketing,
        role: '',
        info: mktInfo,
        hq: dispOp,
        limit: formatLimit(opLimRaw),
      })]
    : [
        makeClaimDocument({
          airline: marketing,
          role: 'Booked',
          info: mktInfo,
          hq: dispMkt,
          limit: formatLimit(mktLimRaw),
        }),
        makeClaimDocument({
          airline: operating,
          role: 'Operated',
          info: opInfo,
          hq: dispOp,
          limit: formatLimit(opLimRaw),
        }),
      ];

  return appendStopoverDocuments(documents, leg);
}

module.exports = {
  buildClaimDocuments,
  extractFlightIata,
};
