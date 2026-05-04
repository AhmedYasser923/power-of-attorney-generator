const fs = require('fs');

function normalize(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks (é→e, ñ→n, etc.)
    .replace(/-/g, ' ')
    .toLowerCase()
    .trim();
}

const airlines = JSON.parse(fs.readFileSync('airlines_codes.json', 'utf8'));
const docs = JSON.parse(fs.readFileSync('airline_docs_data.json', 'utf8'));

// Clear any existing reqs before re-applying
for (const a of airlines) delete a.reqs;

const exactLookup = new Map();   // normalized alias → reqs
const noSpaceLookup = new Map(); // alias with spaces removed → reqs
const containsList = [];         // [{alias, reqs}] for aliases ≥4 chars

for (const entry of docs) {
  for (const alias of entry.names) {
    const norm = normalize(alias);
    exactLookup.set(norm, entry.reqs);
    noSpaceLookup.set(norm.replace(/\s+/g, ''), entry.reqs);
    if (norm.length >= 4) {
      containsList.push({ alias: norm, reqs: entry.reqs });
    }
  }
}

let matched = 0;

for (const airline of airlines) {
  const iata = normalize(airline.iata === 'NA' ? '' : airline.iata);
  const name = normalize(airline.name);
  const nameNoSpace = name.replace(/\s+/g, '');

  // 1. Exact match on iata or name (accent-normalized, so "Air Algérie" = "Air Algerie")
  let reqs = exactLookup.get(iata) ?? exactLookup.get(name) ?? null;

  // 2. Space-stripped match (covers "bintercanarias" ↔ "binter canarias")
  if (!reqs) reqs = noSpaceLookup.get(nameNoSpace) ?? null;

  // 3. Airline name contains alias (covers "corendon dutch airlines" ↔ "corendon dutch"
  //    and all Wizz Air variants ↔ "wizz")
  if (!reqs) {
    for (const item of containsList) {
      if (name.includes(item.alias)) {
        reqs = item.reqs;
        break;
      }
    }
  }

  if (reqs) {
    airline.reqs = reqs;
    matched++;
  }
}

fs.writeFileSync('airlines_codes.json', JSON.stringify(airlines, null, 2));
console.log(`✅ Done. ${matched} airlines matched and updated with document requirements.`);
