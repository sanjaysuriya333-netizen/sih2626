const HttpError = require('./httpError');

// Small CSV parser: quoted fields, "" escapes, commas/newlines inside quotes, CRLF, BOM.
// Returns an array of records (arrays of strings). Blank lines are kept as [''] so that
// record number + 1 always equals the row number the user sees (header = row 1).
function parseCsv(input) {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && field === '') {
      inQuotes = true; // a quote only opens a quoted field at the start of a field
    } else if (c === ',') {
      endField();
    } else if (c === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
    } else if (c === '\n') {
      endRow();
    } else {
      field += c;
    }
  }
  if (inQuotes) throw new HttpError(400, 'INVALID_CSV', 'The CSV has a quote that is never closed');
  if (field !== '' || row.length > 0) endRow(); // last line without a newline
  return rows;
}

module.exports = { parseCsv };