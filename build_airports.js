const fs = require('fs');
const xlsx = require('xlsx');

async function buildUltimateDatabase() {
    const airportMap = new Map();

    try {
        console.log("⏳ Downloading Global Airports Database...");
        const apRes = await fetch('https://raw.githubusercontent.com/mwgg/Airports/master/airports.json');
        const airportsRaw = await apRes.json();

        console.log("⏳ Downloading Country Name mappings...");
        const ccRes = await fetch('https://raw.githubusercontent.com/samayo/country-json/master/src/country-by-abbreviation.json');
        const countries = await ccRes.json();
        
        const countryMap = {};
        countries.forEach(c => { 
            if (c.abbreviation && c.country) countryMap[c.abbreviation.toUpperCase()] = c.country; 
        });

        for (const key in airportsRaw) {
            const ap = airportsRaw[key];
            if (ap.iata && ap.iata !== '\\N' && ap.iata.length === 3) {
                const iata = ap.iata.toUpperCase();
                airportMap.set(iata, {
                    iata: iata,
                    name: ap.name || "",
                    city: ap.city || ap.name || "",
                    country: countryMap[ap.country] || ap.country || "Unknown",
                    lat: parseFloat(ap.lat) || 0, // NOW GRABBING LATITUDE
                    lon: parseFloat(ap.lon) || 0  // NOW GRABBING LONGITUDE
                });
            }
        }
        console.log(`✅ Loaded ${airportMap.size} airports with GPS coordinates.`);
    } catch(e) {
        console.log("⚠️ Could not fetch online DB.", e.message);
    }

    try {
        console.log("⏳ Reading Tools.xlsx...");
        const workbook = xlsx.readFile('Tools.xlsx');
        const sheet = workbook.Sheets['Airports DB'];
        const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const city = String(row[0]).trim();
            const iata = String(row[1]).trim().toUpperCase();
            const name = String(row[2]).trim();
            const country = String(row[3]).trim();

            if (iata && iata.length === 3) {
                if (airportMap.has(iata)) {
                    const existing = airportMap.get(iata);
                    airportMap.set(iata, {
                        ...existing,
                        name: name || existing.name,
                        city: city || existing.city,
                        country: country || existing.country
                    });
                } else {
                    airportMap.set(iata, {
                        iata: iata, name: name || city, city: city, country: country,
                        lat: 0, lon: 0
                    });
                }
            }
        }
    } catch(e) { console.log("⚠️ Could not read Excel file.", e.message); }

    const finalAirports = Array.from(airportMap.values());
    fs.writeFileSync('airports_data.json', JSON.stringify(finalAirports, null, 2));
    console.log(`🚀 SUCCESS! Saved ${finalAirports.length} airports.`);
}

buildUltimateDatabase();