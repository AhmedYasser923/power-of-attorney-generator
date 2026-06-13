'use strict';

const MISSING_DATE_VALUES = new Set([
  '',
  'unknown',
  'not provided',
  'n/a',
  'not available',
  'none',
  'null',
  '-',
  '--'
]);

const MISSING_PNR_VALUES = new Set([
  '',
  'not provided',
  'unknown',
  'n/a',
  'none',
  'null',
  '-',
  '--'
]);

const MONTH_LOOKUP = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  fev: 2,
  fevr: 2,
  fevrier: 2,
  mar: 3,
  march: 3,
  mars: 3,
  apr: 4,
  april: 4,
  avr: 4,
  avril: 4,
  may: 5,
  mai: 5,
  jun: 6,
  june: 6,
  juin: 6,
  jul: 7,
  july: 7,
  juil: 7,
  juillet: 7,
  aug: 8,
  august: 8,
  aout: 8,
  sep: 9,
  sept: 9,
  september: 9,
  septembre: 9,
  oct: 10,
  october: 10,
  octobre: 10,
  nov: 11,
  november: 11,
  novembre: 11,
  dec: 12,
  december: 12,
  decembre: 12
};

const MONTH_TOKEN_RE = '([\\p{L}.]+)';
const DATE_PART_SEPARATOR_RE = '[\\s/.-]+';

function normalizeMonthName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '');
}

function cleanValue(value) {
  return String(value || '')
    .trim()
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, '$1')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMissingDate(value) {
  const normalized = cleanValue(value).toLowerCase();
  return MISSING_DATE_VALUES.has(normalized);
}

function isValidYear(value) {
  return /^\d{4}$/.test(String(value || '').trim());
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function makeIsoDate(year, month, day) {
  const y = Number.parseInt(year, 10);
  const m = Number.parseInt(month, 10);
  const d = Number.parseInt(day, 10);

  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;

  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function partsFromNumeric(year, month, day) {
  const iso = makeIsoDate(year, month, day);
  if (!iso) return null;
  return {
    year: Number.parseInt(year, 10),
    month: Number.parseInt(month, 10),
    day: Number.parseInt(day, 10),
    iso,
    hasYear: true
  };
}

function partsFromText(day, monthName, year) {
  const month = MONTH_LOOKUP[normalizeMonthName(monthName)];
  if (!month) return null;

  const parsedDay = Number.parseInt(day, 10);
  const parsedYear = year ? Number.parseInt(year, 10) : null;

  if (!parsedDay || parsedDay < 1 || parsedDay > 31) return null;

  if (parsedYear) {
    const iso = makeIsoDate(parsedYear, month, parsedDay);
    if (!iso) return null;
    return { year: parsedYear, month, day: parsedDay, iso, hasYear: true };
  }

  return { year: null, month, day: parsedDay, iso: null, hasYear: false };
}

function parseDateParts(value) {
  const text = cleanValue(value);
  if (!text || isMissingDate(text)) return null;

  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  if (match) return partsFromNumeric(match[1], match[2], match[3]);

  match = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (match) return partsFromNumeric(match[1], match[2], match[3]);

  match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (match) return partsFromNumeric(match[3], match[2], match[1]);

  match = text.match(new RegExp(`^(\\d{1,2})${DATE_PART_SEPARATOR_RE}${MONTH_TOKEN_RE}${DATE_PART_SEPARATOR_RE}(\\d{4})$`, 'u'));
  if (match) return partsFromText(match[1], match[2], match[3]);

  match = text.match(new RegExp(`^${MONTH_TOKEN_RE}${DATE_PART_SEPARATOR_RE}(\\d{1,2})${DATE_PART_SEPARATOR_RE}(\\d{4})$`, 'u'));
  if (match) return partsFromText(match[2], match[1], match[3]);

  match = text.match(new RegExp(`^(\\d{1,2})${DATE_PART_SEPARATOR_RE}${MONTH_TOKEN_RE}$`, 'u'));
  if (match) return partsFromText(match[1], match[2]);

  match = text.match(new RegExp(`^${MONTH_TOKEN_RE}${DATE_PART_SEPARATOR_RE}(\\d{1,2})$`, 'u'));
  if (match) return partsFromText(match[2], match[1]);

  return null;
}

function monthDayKey(parts) {
  return parts.month * 100 + parts.day;
}

function normalizePnrToken(value) {
  const token = String(value || '')
    .trim()
    .replace(/^[A-Za-z0-9]{2,3}\s*\/\s*/, '')
    .toUpperCase();

  const normalized = token.toLowerCase();
  if (MISSING_PNR_VALUES.has(normalized) || normalized.includes('scan')) return '';

  return token;
}

function splitPnrValues(value) {
  return String(value || '')
    .split(/[,;]+/)
    .map(normalizePnrToken)
    .filter(Boolean);
}

function passengerNameKeys(passengers) {
  if (!Array.isArray(passengers)) return [];

  return passengers
    .map((passenger) => {
      const first = String(passenger?.firstName || '').trim();
      const last = String(passenger?.lastName || '').trim();
      return `${first} ${last}`.trim().replace(/\s+/g, ' ').toUpperCase();
    })
    .filter(Boolean)
    .map((name) => `passenger:${name}`);
}

class DisjointSet {
  constructor(size) {
    this.parents = Array.from({ length: size }, (_, index) => index);
  }

  find(index) {
    if (this.parents[index] !== index) {
      this.parents[index] = this.find(this.parents[index]);
    }
    return this.parents[index];
  }

  union(a, b) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parents[rootB] = rootA;
  }
}

function collectLegs(journeys, fallbackYear) {
  const legs = [];

  if (!Array.isArray(journeys)) return legs;

  journeys.forEach((journey, journeyIndex) => {
    const journeyPassengerKeys = passengerNameKeys(journey.passengers);

    (journey.routes || []).forEach((route, routeIndex) => {
      (route.legs || []).forEach((leg, legIndex) => {
        const rawParts = parseDateParts(leg.rawExtractedDate);
        const dateParts = parseDateParts(leg.date);
        const rawIsMissing = isMissingDate(leg.rawExtractedDate);
        const dateLooksLikeFallback = fallbackYear && dateParts?.hasYear && dateParts.year === fallbackYear;
        const printedParts = rawParts?.hasYear
          ? rawParts
          : rawIsMissing && dateParts?.hasYear && !dateLooksLikeFallback
            ? dateParts
            : null;
        const monthDayParts = rawParts?.month && rawParts?.day
          ? rawParts
          : dateParts?.month && dateParts?.day
            ? dateParts
            : null;
        const keys = [`journey:${journeyIndex}`];

        journeyPassengerKeys.forEach((key) => keys.push(key));
        splitPnrValues(leg.pnr).forEach((pnr) => keys.push(`pnr:${pnr}`));
        (leg.passengerTickets || []).forEach((ticket) => {
          const passengerName = String(ticket?.passengerName || '')
            .trim()
            .replace(/\s+/g, ' ')
            .toUpperCase();
          if (passengerName) keys.push(`passenger:${passengerName}`);
          splitPnrValues(ticket?.pnr).forEach((pnr) => keys.push(`pnr:${pnr}`));
        });

        legs.push({
          index: legs.length,
          journeyIndex,
          routeIndex,
          legIndex,
          leg,
          keys,
          rawParts,
          dateParts,
          printedParts,
          monthDayParts
        });
      });
    });
  });

  return legs;
}

function buildClusters(legs) {
  const dsu = new DisjointSet(legs.length);
  const seenKeys = new Map();

  legs.forEach((entry) => {
    entry.keys.forEach((key) => {
      if (seenKeys.has(key)) {
        dsu.union(entry.index, seenKeys.get(key));
      } else {
        seenKeys.set(key, entry.index);
      }
    });
  });

  const clusters = new Map();
  legs.forEach((entry) => {
    const root = dsu.find(entry.index);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(entry);
  });

  return Array.from(clusters.values()).map((cluster) =>
    cluster.sort((a, b) => a.index - b.index)
  );
}

function applyUnresolved(entry) {
  if (!entry.monthDayParts) {
    entry.leg.dateYearSource = 'unresolved';
    entry.leg.dateYearApplied = '';
    return;
  }

  const printed = cleanValue(entry.leg.rawExtractedDate);
  const fallback = cleanValue(entry.leg.date);
  entry.leg.date = printed || fallback || '';
  entry.leg.dateYearSource = 'unresolved';
  entry.leg.dateYearApplied = '';
}

function applyResolvedDate(entry, year, source) {
  const parts = entry.monthDayParts;
  const iso = parts ? makeIsoDate(year, parts.month, parts.day) : null;

  if (!iso) {
    applyUnresolved(entry);
    return;
  }

  entry.leg.date = iso;
  entry.leg.dateYearSource = source;
  entry.leg.dateYearApplied = String(year);
}

function resolveCluster(cluster, fallbackYear) {
  const datedEntries = cluster.filter((entry) => entry.monthDayParts);
  if (datedEntries.length === 0) {
    cluster.forEach(applyUnresolved);
    return;
  }

  const anchors = datedEntries.filter((entry) => entry.printedParts?.hasYear);

  if (anchors.length === 0 && !fallbackYear) {
    datedEntries.forEach(applyUnresolved);
    cluster
      .filter((entry) => !entry.monthDayParts)
      .forEach(applyUnresolved);
    return;
  }

  const assignedYears = new Map();

  if (anchors.length > 0) {
    anchors.forEach((entry) => assignedYears.set(entry.index, entry.printedParts.year));

    const firstAnchor = anchors[0];
    let previousParts = firstAnchor.monthDayParts;
    let previousYear = firstAnchor.printedParts.year;

    datedEntries
      .filter((entry) => entry.index > firstAnchor.index)
      .forEach((entry) => {
        let year = assignedYears.has(entry.index) ? assignedYears.get(entry.index) : previousYear;
        if (!assignedYears.has(entry.index) && monthDayKey(entry.monthDayParts) < monthDayKey(previousParts)) {
          year += 1;
        }
        assignedYears.set(entry.index, year);
        previousParts = entry.monthDayParts;
        previousYear = year;
      });

    previousParts = firstAnchor.monthDayParts;
    previousYear = firstAnchor.printedParts.year;

    datedEntries
      .filter((entry) => entry.index < firstAnchor.index)
      .reverse()
      .forEach((entry) => {
        let year = assignedYears.has(entry.index) ? assignedYears.get(entry.index) : previousYear;
        if (!assignedYears.has(entry.index) && monthDayKey(entry.monthDayParts) > monthDayKey(previousParts)) {
          year -= 1;
        }
        assignedYears.set(entry.index, year);
        previousParts = entry.monthDayParts;
        previousYear = year;
      });
  } else {
    let previousParts = datedEntries[0].monthDayParts;
    let previousYear = fallbackYear;
    assignedYears.set(datedEntries[0].index, fallbackYear);

    datedEntries.slice(1).forEach((entry) => {
      let year = previousYear;
      if (monthDayKey(entry.monthDayParts) < monthDayKey(previousParts)) {
        year += 1;
      }
      assignedYears.set(entry.index, year);
      previousParts = entry.monthDayParts;
      previousYear = year;
    });
  }

  datedEntries.forEach((entry) => {
    const year = assignedYears.get(entry.index);
    const source = entry.printedParts?.hasYear
      ? 'document'
      : anchors.length > 0
        ? 'document-propagated'
        : 'user-input';

    applyResolvedDate(entry, year, source);
  });

  cluster
    .filter((entry) => !entry.monthDayParts)
    .forEach(applyUnresolved);
}

function resolveJourneyYears(journeys, journeyYear) {
  const fallbackYear = isValidYear(journeyYear) ? Number.parseInt(journeyYear, 10) : null;
  const legs = collectLegs(journeys, fallbackYear);
  const clusters = buildClusters(legs);

  clusters.forEach((cluster) => resolveCluster(cluster, fallbackYear));

  return journeys;
}

module.exports = {
  parseDateParts,
  resolveJourneyYears
};
