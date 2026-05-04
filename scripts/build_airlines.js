const xlsx = require('xlsx');
const fs = require('fs');

try {
  // Read from your master Excel file
  const workbook = xlsx.readFile('Tools.xlsx');
  const sheet = workbook.Sheets['Airline DB'];
  
  // Convert sheet to a raw 2D array
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const records = [];

  // Loop through rows (skipping the first 2 header rows)
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    const rawName = String(row[0]).trim();
    if (!rawName) continue;

    let name = rawName;
    let iata = '';
    
    // Extract IATA if it exists in parentheses, e.g., "Ryanair (FR)"
    const match = rawName.match(/(.+?)\s*\((.+?)\)/);
    if (match) {
        name = match[1].trim();
        iata = match[2].trim();
    }

    // Column 5 (F) is 'Mandatory' requirements
    const reqs = String(row[5]).trim(); 

    records.push({
        name: name,
        iata: iata,
        // If requirements are blank, assign the standard default
        reqs: reqs || "No documents required"
    });
  }

  // Save to JSON
  fs.writeFileSync('airlines_data.json', JSON.stringify(records, null, 2));
  console.log(`✅ Successfully extracted ${records.length} airlines into airlines_data.json!`);

} catch (err) {
  console.error('❌ Error:', err.message);
}