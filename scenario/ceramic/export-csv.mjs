// Writes the masters of Demo Ceramics Co. (scenario/gen/ceramic.mjs) as the five CSV files the importer takes (import/ceramic/*.csv),
// so the importer's sample folder and the scenario engine's company are one and the same data.
//   node scenario/ceramic/export-csv.mjs [--out import/ceramic]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCeramicBook } from '../gen/ceramic.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outArg = process.argv.indexOf('--out');
const out = resolve(outArg > 0 ? process.argv[outArg + 1] : join(here, '..', '..', 'import', 'ceramic'));
const book = buildCeramicBook();
const q = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (header, rows) => [header.join(','), ...rows.map((r) => r.map(q).join(','))].join('\n') + '\n';
const days = (terms) => ({ NET15: 15, NET30: 30, NET45: 45, NET60: 60 }[terms] ?? 30);
mkdirSync(out, { recursive: true });

writeFileSync(join(out, 'parties.csv'), csv(['kind', 'code', 'name', 'payment_terms_days', 'credit_limit'], [
  ...book.suppliers.map((s) => ['supplier', s.code, s.name, days(s.terms), '']),
  ...book.customers.map((c) => ['customer', c.code, c.name, c.terms_days, c.credit_limit_egp ?? '']),
]));
writeFileSync(join(out, 'items.csv'), csv(['code', 'name_en', 'name_ar', 'type', 'uom', 'tracking', 'procurement', 'lead_time_days', 'moq', 'lot_rule', 'lot_size', 'safety_stock', 'supplier_code', 'purchase_price', 'sale_price', 'line'],
  book.items.map((i) => [i.code, i.name_en, i.name_ar, i.type, i.uom, 'lot', i.procurement, i.lead_time_days, i.moq, i.lot_rule, i.lot_size, i.safety_stock ?? 0, i.supplier ?? '', i.purchase_price ?? '', i.sell_in_egp ?? '', i.line ?? ''])));
const crew = Object.fromEntries(book.people.station_requirements.map((r) => [r.station, r.crew]));
writeFileSync(join(out, 'plant.csv'), csv(['code', 'type', 'parent', 'name', 'capacity_per_shift', 'crew'],
  book.plant.map((n) => [n.code, n.type, n.parent ?? '', n.name, n.capacity_per_shift ?? '', n.type === 'station' ? crew[n.code] ?? '' : ''])));
writeFileSync(join(out, 'boms.csv'), csv(['item', 'component', 'qty_per', 'op', 'scan'],
  Object.entries(book.boms).flatMap(([item, b]) => b.lines.map((l) => [item, l.component, l.qty_per, l.op, l.scan]))));
const mandatory = new Set(['PR', 'GL', 'SP']);
writeFileSync(join(out, 'routings.csv'), csv(['item', 'seq', 'op', 'name', 'kind', 'cycle_s', 'mandatory'],
  Object.entries(book.routings).flatMap(([item, r]) => r.operations.map((o) => [item, o.seq, o.code, o.name, o.kind, '', mandatory.has(o.code) ? 'yes' : 'no']))));
console.log(`wrote ${out}: ${book.suppliers.length + book.customers.length} parties, ${book.items.length} items, ${book.plant.length} plant nodes, ${Object.keys(book.routings).length} routings, ${Object.keys(book.boms).length} bills of materials`);
