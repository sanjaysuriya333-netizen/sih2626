// Writes RFC 4180 CSV for the report downloads. (utils/csv.js is the reader used by the import.)
// Text that starts with = + - @ tab or CR gets a leading ' so a spreadsheet
// cannot run it as a formula. Numbers are never changed.
function cell(value) {
  if (value === null || value === undefined) return '';
  const isText = typeof value === 'string';
  let s = isText ? value : String(value);
  if (isText && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// columns: [{ key, label }]   rows: [{ [key]: value }]. The leading BOM lets Excel read UTF-8.
function toCsv(columns, rows) {
  const lines = [columns.map((c) => cell(c.label)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c.key])).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

module.exports = { toCsv };