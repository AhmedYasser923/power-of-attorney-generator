const xlsx = require('xlsx');
const fs = require('fs');

try {
  const workbook = xlsx.readFile('Tools.xlsx');
  const sheet = workbook.Sheets['EOC DB'];
  
  // Read as a raw 2D array (ignoring header names entirely to avoid duplicate header bugs)
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  
  const records = [];

  // Helper to safely convert Excel serial numbers to YYYY-MM-DD
  function formatExcelDate(val) {
    if (!val) return '';
    if (typeof val === 'number') {
        const d = new Date(Math.round((val - 25569) * 86400 * 1000));
        return d.toISOString().split('T')[0];
    }
    let str = String(val).trim();
    if (str.includes('T')) return str.split('T')[0];
    return str;
  }

  // Start looping from row index 2 (skipping the super-headers and column headers)
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    
    // 1. World Wide Issues (Columns 0, 1, 2)
    const wwDate = row[0];
    const wwEvent = String(row[1]).trim();
    const wwDec = String(row[2]).trim() || "REJECT";
    if (wwDate && wwEvent) {
      records.push({ category: "World Wide", date: formatExcelDate(wwDate), event: wwEvent, location: "World Wide", decision: wwDec });
    }

    // 2. Ongoing Issues (Columns 3, 4, 5, 6)
    const ogDate = row[3];
    const ogLoc = String(row[4]).trim();
    const ogEvent = String(row[5]).trim();
    const ogDec = String(row[6]).trim() || "REJECT";
    if (ogDate && ogEvent) {
      records.push({ category: "Ongoing Issues", date: formatExcelDate(ogDate), event: ogEvent, location: ogLoc, decision: ogDec });
    }

    // 3. Country Wide Issues (Columns 8, 9, 10, 11)
    const cwLoc = String(row[8]).trim();
    const cwDate = row[9];
    const cwEvent = String(row[10]).trim();
    const cwDec = String(row[11]).trim() || "REJECT";
    if (cwDate && cwEvent) {
      records.push({ category: "Country Wide Issues", date: formatExcelDate(cwDate), event: cwEvent, location: cwLoc, decision: cwDec });
    }

    // 4. Airport Issues (Columns 13, 14, 15, 16)
    const aptLoc = String(row[13]).trim();
    const aptDate = row[14];
    const aptEvent = String(row[15]).trim();
    const aptDec = String(row[16]).trim() || "REJECT";
    if (aptDate && aptEvent) {
      records.push({ category: "Airport Issues", date: formatExcelDate(aptDate), event: aptEvent, location: aptLoc, decision: aptDec });
    }
  }

  // Sort newest to oldest
  records.sort((a, b) => new Date(b.date) - new Date(a.date));

  fs.writeFileSync('eoc_data.json', JSON.stringify(records, null, 2));
  console.log(`✅ Flawlessly extracted ${records.length} records directly from Excel!`);

} catch (err) {
  console.error('❌ Error:', err.message);
}