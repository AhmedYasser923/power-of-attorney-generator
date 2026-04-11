'use strict';

const xlsx = require('xlsx');
const fs   = require('fs');
const path = require('path');
const { setRecords } = require('./eocStore');

const EXPORT_URL    = 'https://docs.google.com/spreadsheets/d/1v24u0ycDMAN6KyPmcvGCkhszdC0i8StNaYU-fRzJxvM/export?format=xlsx';
const EOC_JSON_PATH = path.join(__dirname, '../eoc_data.json');

function formatExcelDate(val) {
  if (!val) return '';
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().split('T')[0];
  }
  const str = String(val).trim();
  return str.includes('T') ? str.split('T')[0] : str;
}

function parseSheet(workbook) {
  const sheet = workbook.Sheets['EOC DB'];
  if (!sheet) throw new Error("Sheet tab 'EOC DB' not found in the downloaded workbook.");
  const rows    = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const records = [];

  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];

    if (r[0] && String(r[1]).trim())
      records.push({ category: 'World Wide', date: formatExcelDate(r[0]), event: String(r[1]).trim(), location: 'World Wide', decision: String(r[2]).trim() || 'REJECT' });

    if (r[3] && String(r[5]).trim())
      records.push({ category: 'Ongoing Issues', date: formatExcelDate(r[3]), event: String(r[5]).trim(), location: String(r[4]).trim(), decision: String(r[6]).trim() || 'REJECT' });

    if (r[9] && String(r[10]).trim())
      records.push({ category: 'Country Wide Issues', date: formatExcelDate(r[9]), event: String(r[10]).trim(), location: String(r[8]).trim(), decision: String(r[11]).trim() || 'REJECT' });

    if (r[14] && String(r[15]).trim())
      records.push({ category: 'Airport Issues', date: formatExcelDate(r[14]), event: String(r[15]).trim(), location: String(r[13]).trim(), decision: String(r[16]).trim() || 'REJECT' });
  }

  records.sort((a, b) => new Date(b.date) - new Date(a.date));
  return records;
}

async function syncEocFromSheet(previousCount) {
  const response = await fetch(EXPORT_URL, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Google Sheets export failed: HTTP ${response.status}`);

  const buffer   = Buffer.from(await response.arrayBuffer());
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const records  = parseSheet(workbook);
  const newCount = setRecords(records);

  try {
    fs.writeFileSync(EOC_JSON_PATH, JSON.stringify(records, null, 2));
  } catch (err) {
    console.warn('[syncEoc] Disk write failed (in-memory update still applied):', err.message);
  }

  return { newCount, delta: newCount - previousCount };
}

module.exports = { syncEocFromSheet };
