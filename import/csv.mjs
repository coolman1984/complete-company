// A small CSV reader (RFC 4180: quoted cells, doubled quotes, commas or semicolons, any line ending, a byte-order mark).
// Excel in some regions saves with semicolons: the separator is taken from the header line. No dependencies.

/** Rows as arrays of cells, each with its line number (the first line is 1). Blank lines are skipped. */
export function parseCsv(text) {
  const src = text.replace(/^﻿/, '');
  const head = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = (head.match(/;/g) ?? []).length > (head.match(/,/g) ?? []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', quoted = false, line = 1, start = 1;
  const endCell = () => { row.push(cell.trim()); cell = ''; };
  const endRow = () => { endCell(); if (row.some((c) => c !== '')) rows.push({ line: start, cells: row }); row = []; start = line + 1; };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else { if (ch === '\n') line++; cell += ch; }
    } else if (ch === '"' && cell.trim() === '') { quoted = true; cell = ''; }
    else if (ch === sep) endCell();
    else if (ch === '\n') { endRow(); line++; start = line; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length) endRow();
  return rows;
}

/** A table: the first row names the columns (case-insensitive, spaces and dashes become underscores); each record carries its line. */
export function readTable(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { columns: [], records: [] };
  const columns = rows[0].cells.map((c) => c.toLowerCase().replace(/[\s-]+/g, '_'));
  const records = rows.slice(1).map((r) => {
    const rec = { _line: r.line };
    columns.forEach((c, i) => { if (c) rec[c] = r.cells[i] ?? ''; });
    return rec;
  });
  return { columns, records };
}
