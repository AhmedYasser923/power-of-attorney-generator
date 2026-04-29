const xlsx = require('xlsx');
const fs = require('fs');

try {
  const workbook = xlsx.readFile('Airline Codes.xlsx');
  const sheet = workbook.Sheets['Airline codes'];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const records = [];

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    const name = String(row[2] ?? '').trim();
    if (!name) continue;

    records.push({
      name,
      iata: String(row[0] ?? '').trim() || 'NA',
      icao: String(row[1] ?? '').trim() || 'NA',
      country: String(row[4] ?? '').trim()
    });
  }

  fs.writeFileSync('airlines_codes.json', JSON.stringify(records, null, 2));
  console.log(`✅ Written ${records.length} airlines to airlines_codes.json`);
} catch (err) {
  console.error('❌ Error:', err.message);
}
