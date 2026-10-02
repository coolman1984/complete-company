// Master data import: a folder of CSV files -> Mizan (parties, items) and Itqan (plant, routings, bills of materials).
//   dry run (default)  reads and checks everything, lists every problem with its file and line, creates nothing
//   --apply            enters it through the applications' own HTTP APIs (never a database), in the order they need it
// Safe to run again: what already exists (by code or name) is skipped, a changed value is reported, never overwritten.
// Files (all optional; a missing file is skipped): parties.csv, items.csv, plant.csv, routings.csv, boms.csv. See templates/.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readTable } from './csv.mjs';

const U = 1000;
export const TYPES = ['raw', 'semi', 'finished', 'packaging', 'service'];
const OP_KINDS = ['work', 'test', 'inspection', 'pack'];
const SCANS = ['serial', 'lot', 'none'];
const LOT_RULES = ['lot_for_lot', 'fixed', 'multiple'];
const PLANT_ORDER = ['plant', 'area', 'line', 'station', 'equipment'];
const PLANT_PARENT = { plant: null, area: 'plant', line: 'area', station: 'line', equipment: 'station' };
const MATERIAL = { raw: 'raw', semi: 'semi_finished', finished: 'finished', packaging: 'packaging', service: 'service' };
const cents = (x) => Math.round(x * 100);

/** Reads the folder into tables (missing files are empty). `read(name)` returns the text or null. */
export function loadFolder(folder, read = (name) => (existsSync(join(folder, name)) ? readFileSync(join(folder, name), 'utf8') : null)) {
  const tables = {};
  for (const name of ['parties', 'items', 'plant', 'routings', 'boms']) {
    const text = read(`${name}.csv`);
    tables[name] = text === null ? { present: false, columns: [], records: [] } : { present: true, ...readTable(text) };
  }
  return tables;
}

/**
 * Checks the tables against the applications' own rules and returns the clean model the apply step enters.
 * { problems: [{file, line, message}], warnings: [...], model }. Anything in `problems` stops --apply.
 */
export function validate(tables) {
  const problems = [], warnings = [];
  const bad = (file, rec, message) => problems.push({ file: `${file}.csv`, line: rec?._line ?? 0, message });
  const warn = (file, rec, message) => warnings.push({ file: `${file}.csv`, line: rec?._line ?? 0, message });
  const need = (file, cols) => { const t = tables[file]; if (t.present) for (const c of cols) if (!t.columns.includes(c)) problems.push({ file: `${file}.csv`, line: 1, message: `the column "${c}" is missing` }); };
  need('parties', ['kind', 'name']); need('items', ['code', 'name_en', 'type', 'uom']); need('plant', ['code', 'type', 'name']);
  need('routings', ['item', 'seq', 'op']); need('boms', ['item', 'component', 'qty_per']);
  const num = (file, rec, key, { min = 0, int = false, optional = true } = {}) => {
    const raw = (rec[key] ?? '').replace(/,/g, '');
    if (raw === '') { if (!optional) bad(file, rec, `${key} is required`); return undefined; }
    const v = Number(raw);
    if (!Number.isFinite(v) || v < min || (int && !Number.isInteger(v))) { bad(file, rec, `${key} "${rec[key]}" must be ${int ? 'a whole number' : 'a number'} from ${min}`); return undefined; }
    return v;
  };
  const oneOf = (file, rec, key, list, fallback) => {
    const v = (rec[key] ?? '').toLowerCase();
    if (v === '') return fallback;
    if (!list.includes(v)) { bad(file, rec, `${key} "${rec[key]}" must be one of ${list.join(', ')}`); return fallback; }
    return v;
  };

  // ---- parties
  const parties = [], partySeen = new Set();
  for (const r of tables.parties.records) {
    const kind = oneOf('parties', r, 'kind', ['supplier', 'customer']);
    if (!r.name) bad('parties', r, 'name is required');
    const key = `${kind}|${(r.code || r.name).toLowerCase()}`;
    if (partySeen.has(key)) bad('parties', r, `${kind} "${r.code || r.name}" appears twice`);
    partySeen.add(key);
    parties.push({ line: r._line, kind, code: r.code || r.name, name: r.name, terms: num('parties', r, 'payment_terms_days', { int: true }) ?? 30, credit: num('parties', r, 'credit_limit') });
  }
  const suppliers = new Set(parties.filter((p) => p.kind === 'supplier').map((p) => p.code));

  // ---- items
  const items = [], itemByCode = new Map();
  for (const r of tables.items.records) {
    if (!r.code) { bad('items', r, 'code is required'); continue; }
    if (r.code.length > 50) bad('items', r, 'code is longer than 50 characters');
    if (itemByCode.has(r.code)) { bad('items', r, `item "${r.code}" appears twice (first on line ${itemByCode.get(r.code).line})`); continue; }
    if (!r.name_en) bad('items', r, 'name_en is required');
    if (!r.uom) bad('items', r, 'uom (unit of measure) is required');
    const type = oneOf('items', r, 'type', TYPES, 'raw');
    if (!(r.type ?? '')) bad('items', r, 'type is required');
    const made = type === 'semi' || type === 'finished';
    const it = {
      line: r._line, code: r.code, nameEn: r.name_en, nameAr: r.name_ar || r.name_en, type, uom: r.uom,
      tracking: type === 'service' ? 'none' : oneOf('items', r, 'tracking', ['none', 'lot', 'serial'], made ? 'serial' : 'none'),
      procurement: oneOf('items', r, 'procurement', ['buy', 'make'], made ? 'make' : 'buy'),
      leadDays: num('items', r, 'lead_time_days', { int: true }) ?? 0, moq: num('items', r, 'moq') ?? 0,
      lotRule: oneOf('items', r, 'lot_rule', LOT_RULES, 'lot_for_lot'), lotSize: num('items', r, 'lot_size') ?? 0, safety: num('items', r, 'safety_stock') ?? 0,
      supplier: r.supplier_code || null, buyPrice: num('items', r, 'purchase_price') ?? 0, sellPrice: num('items', r, 'sale_price') ?? 0, productionLine: r.line || null,
    };
    if (it.supplier && !suppliers.has(it.supplier)) bad('items', r, `supplier_code "${it.supplier}" is not in parties.csv`);
    if (it.type === 'finished' && it.procurement === 'buy') warn('items', r, `${it.code} is finished but bought: no routing or bill of materials will be used`);
    if (it.lotRule !== 'lot_for_lot' && it.lotSize <= 0) bad('items', r, `lot_rule ${it.lotRule} needs a lot_size above 0`);
    items.push(it);
    itemByCode.set(it.code, it);
  }

  // ---- plant
  const nodes = [], nodeByCode = new Map();
  for (const r of tables.plant.records) {
    const type = oneOf('plant', r, 'type', PLANT_ORDER);
    if (!r.code) { bad('plant', r, 'code is required'); continue; }
    if (nodeByCode.has(r.code)) { bad('plant', r, `node "${r.code}" appears twice`); continue; }
    const n = { line: r._line, code: r.code, type, parent: r.parent || null, nameEn: r.name || r.code, capacity: num('plant', r, 'capacity_per_shift'), crew: num('plant', r, 'crew', { int: true }) };
    nodes.push(n);
    nodeByCode.set(n.code, n);
  }
  for (const n of nodes) {
    const want = PLANT_PARENT[n.type];
    if (want === null && n.parent) bad('plant', { _line: n.line }, 'a plant has no parent');
    if (want) {
      const p = nodeByCode.get(n.parent ?? '');
      if (!n.parent) bad('plant', { _line: n.line }, `a ${n.type} belongs to a ${want}: give its parent`);
      else if (!p) bad('plant', { _line: n.line }, `parent "${n.parent}" is not in plant.csv (list parents before their children is not needed, but they must exist)`);
      else if (p.type !== want) bad('plant', { _line: n.line }, `a ${n.type} belongs to a ${want}, not to a ${p.type} (${p.code})`);
      if (n.type === 'station' && p && !n.code.startsWith(`${p.code}-`)) bad('plant', { _line: n.line }, `station "${n.code}" must be named <line>-<operation>, e.g. ${p.code}-TEST: the operation code is what the routing uses`);
    }
  }
  if (!nodes.length && tables.plant.present === false) { /* plant is optional */ }

  // ---- routings
  const routings = new Map();
  for (const r of tables.routings.records) {
    const item = itemByCode.get(r.item);
    if (!item) { bad('routings', r, `item "${r.item}" is not in items.csv`); continue; }
    if (item.procurement !== 'make') warn('routings', r, `${item.code} is bought: its routing is ignored by planning`);
    const seq = num('routings', r, 'seq', { int: true, min: 1, optional: false });
    if (!r.op) bad('routings', r, 'op (the operation code) is required');
    const kind = oneOf('routings', r, 'kind', OP_KINDS, 'work');
    const op = { line: r._line, seq, code: (r.op || '').toUpperCase(), name: r.name || r.op, kind, cycleSec: num('routings', r, 'cycle_s'), mandatory: (r.mandatory ?? '').toLowerCase() };
    if (op.mandatory && !['yes', 'no', 'true', 'false', '1', '0'].includes(op.mandatory)) bad('routings', r, 'mandatory must be yes or no (empty = by the default rule)');
    if (!routings.has(item.code)) routings.set(item.code, []);
    routings.get(item.code).push(op);
  }
  for (const [code, ops] of routings) {
    ops.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    const seqs = new Set(), codes = new Set();
    for (const o of ops) {
      if (seqs.has(o.seq)) bad('routings', { _line: o.line }, `${code}: operation sequence ${o.seq} is used twice`);
      if (codes.has(o.code)) bad('routings', { _line: o.line }, `${code}: operation ${o.code} is used twice`);
      seqs.add(o.seq); codes.add(o.code);
    }
    ops.slice(0, -1).filter((o) => o.kind === 'pack').forEach((o) => bad('routings', { _line: o.line }, `${code}: packing (${o.code}) must be the last operation`));
    const line = itemByCode.get(code)?.productionLine;
    if (!line && nodes.length) warn('items', { _line: itemByCode.get(code).line }, `${code} has a routing but no line: planning will not know where to make it`);
    if (line && nodes.length && nodeByCode.get(line)?.type !== 'line') bad('items', { _line: itemByCode.get(code).line }, `line "${line}" is not a line in plant.csv`);
  }

  // ---- bills of materials
  const boms = new Map();
  for (const r of tables.boms.records) {
    const parent = itemByCode.get(r.item), comp = itemByCode.get(r.component);
    if (!parent) { bad('boms', r, `item "${r.item}" is not in items.csv`); continue; }
    if (!comp) { bad('boms', r, `component "${r.component}" is not in items.csv`); continue; }
    if (comp.code === parent.code) { bad('boms', r, `${parent.code} cannot contain itself`); continue; }
    const qty = num('boms', r, 'qty_per', { optional: false });
    if (qty !== undefined && qty <= 0) bad('boms', r, 'qty_per must be above 0');
    if (qty !== undefined && Math.abs(qty * U - Math.round(qty * U)) > 1e-9) bad('boms', r, `qty_per ${r.qty_per} has more than 3 decimals: quantities are exact to the thousandth`);
    const scan = oneOf('boms', r, 'scan', SCANS, 'none');
    const list = boms.get(parent.code) ?? [];
    if (list.some((l) => l.component === comp.code)) bad('boms', r, `${comp.code} is listed twice in the bill of ${parent.code}`);
    list.push({ line: r._line, component: comp.code, qty, op: (r.op || '').toUpperCase(), scan, service: comp.type === 'service' });
    boms.set(parent.code, list);
  }
  for (const [code, lines] of boms) {
    const ops = routings.get(code);
    if (!ops) warn('boms', { _line: lines[0].line }, `${code} has a bill of materials but no routing: it cannot be produced by scan`);
    for (const l of lines) {
      if (ops && l.op && !ops.some((o) => o.code === l.op)) bad('boms', { _line: l.line }, `${code}: operation "${l.op}" is not in its routing`);
      if (ops && !l.op && !l.service) bad('boms', { _line: l.line }, `${code}: ${l.component} needs op (the operation that uses it)`);
      const comp = itemByCode.get(l.component);
      if (l.scan === 'serial' && comp.tracking !== 'serial') { warn('boms', { _line: l.line }, `${l.component} is scanned by serial but tracked as ${comp.tracking}: it is scanned by lot instead`); l.scan = 'lot'; }
      if (l.scan === 'lot' && comp.tracking === 'none') warn('boms', { _line: l.line }, `${l.component} is scanned by lot but not lot-tracked in items.csv: Mizan will not hold lots of it`);
    }
  }
  // a part that contains itself, however deep, can never be built
  const state = new Map();
  const visit = (code, trail) => {
    if (state.get(code) === 2) return;
    if (state.get(code) === 1) { bad('boms', { _line: boms.get(trail[0])?.[0]?.line }, `circular bill of materials: ${[...trail, code].join(' > ')}`); return; }
    state.set(code, 1);
    for (const l of boms.get(code) ?? []) visit(l.component, [...trail, code]);
    state.set(code, 2);
  };
  for (const code of boms.keys()) visit(code, []);

  // by default only the operations a unit must visit are mandatory: the first, the last and the ones that scan a part (the others may be skipped)
  for (const [code, ops] of routings) {
    const scanned = new Set((boms.get(code) ?? []).filter((l) => l.scan !== 'none').map((l) => l.op));
    ops.forEach((o, i) => {
      o.isMandatory = o.mandatory ? ['yes', 'true', '1'].includes(o.mandatory) : i === 0 || i === ops.length - 1 || scanned.has(o.code);
    });
  }
  // stations the routings need: <line>-<op> for every mandatory operation of an item made on that line
  for (const [code, ops] of routings) {
    const line = itemByCode.get(code)?.productionLine;
    if (!line || !nodes.length) continue;
    for (const o of ops.filter((x) => x.isMandatory)) if (!nodeByCode.has(`${line}-${o.code}`)) bad('routings', { _line: o.line }, `${code}: operation ${o.code} needs a station ${line}-${o.code} in plant.csv`);
  }
  return { problems, warnings, model: { parties, items, nodes, routings, boms, itemByCode } };
}

const paymentDays = (d) => d;

/**
 * Enters the model. `mz` and `gm` are API callers (scenario/engine/client.mjs); either may be null to leave that application out.
 * `pump()` makes the applications exchange (items reach Itqan only after Mizan has published them). Returns what it did.
 */
export async function apply(model, { mz, gm, pump, log = () => {} }) {
  const done = { created: {}, skipped: {}, notes: [] };
  const count = (kind, what) => { (done[what][kind] = done[what][kind] ?? 0); done[what][kind]++; };
  const mizanId = {}, partyId = {};
  if (mz) {
    const existingParties = await mz('GET', '/api/parties');
    const list = Array.isArray(existingParties) ? existingParties : existingParties.rows ?? [];
    for (const p of model.parties) {
      const have = list.find((x) => x.name === p.name);
      if (have) { partyId[`${p.kind}|${p.code}`] = have.id; count('parties', 'skipped'); continue; }
      partyId[`${p.kind}|${p.code}`] = (await mz('POST', '/api/parties', { kind: p.kind, name: p.name, paymentTermsDays: paymentDays(p.terms), ...(p.credit ? { creditLimit: cents(p.credit) } : {}) })).id;
      count('parties', 'created');
    }
    const exItems = await mz('GET', '/api/items');
    const haveItems = new Map((Array.isArray(exItems) ? exItems : exItems.rows ?? []).map((i) => [i.sku ?? i.code, i.id]));
    for (const it of model.items) {
      if (haveItems.has(it.code)) { mizanId[it.code] = haveItems.get(it.code); count('items', 'skipped'); continue; }
      mizanId[it.code] = (await mz('POST', '/api/items', {
        sku: it.code, nameEn: it.nameEn.slice(0, 200), nameAr: it.nameAr.slice(0, 200), kind: it.type === 'service' ? 'service' : 'product', unit: it.uom, trackStock: it.type !== 'service',
        salePrice: cents(it.sellPrice), purchasePrice: cents(it.buyPrice), tracking: it.tracking === 'lot' ? 'batch' : it.tracking,
        materialType: MATERIAL[it.type], procurementType: it.procurement, leadTimeDays: it.leadDays, moq: Math.round(it.moq * U), lotSizeRule: it.lotRule,
        lotSize: it.lotRule === 'lot_for_lot' ? 0 : Math.round(it.lotSize * U), safetyStock: Math.round(it.safety * U),
        ...(it.supplier && partyId[`supplier|${it.supplier}`] ? { defaultSupplierId: partyId[`supplier|${it.supplier}`] } : {}),
      })).id;
      count('items', 'created');
    }
  }
  if (!gm) return done;

  // Itqan gets the items from Mizan (it never creates them): exchange until they have arrived
  const stock = model.items.filter((i) => i.type !== 'service');
  let gid = {};
  for (let round = 0; round < 12; round++) {
    gid = Object.fromEntries((await gm('GET', '/api/items')).map((i) => [i.code, i.id]));
    if (stock.every((i) => gid[i.code])) break;
    if (!pump) break;
    await pump();
  }
  const missing = stock.filter((i) => !gid[i.code]).map((i) => i.code);
  if (missing.length) throw new Error(`Itqan has not received ${missing.length} items from Mizan yet (${missing.slice(0, 5).join(', ')}): pair the applications first (portal /pair) and run again`);

  const exNodes = Object.fromEntries((await gm('GET', '/api/plant')).map((n) => [n.code, n.id]));
  const nodeId = { ...exNodes };
  for (const n of [...model.nodes].sort((a, b) => PLANT_ORDER.indexOf(a.type) - PLANT_ORDER.indexOf(b.type))) {
    if (exNodes[n.code]) { count('plant', 'skipped'); continue; }
    nodeId[n.code] = (await gm('POST', '/api/plant', { code: n.code, type: n.type, nameEn: n.nameEn.slice(0, 120), ...(n.parent ? { parentId: nodeId[n.parent] } : {}), ...(n.type === 'line' && n.capacity ? { capacityPerShift: n.capacity } : {}) })).id;
    count('plant', 'created');
  }
  for (const n of model.nodes.filter((x) => x.crew)) await gm('PUT', '/api/pln/crew-settings', { node: n.code, crew: n.crew });

  const exRoutings = await gm('GET', '/api/routings?status=approved');
  const hasRouting = new Set(exRoutings.map((r) => r.item_code));
  for (const [code, ops] of model.routings) {
    if (hasRouting.has(code)) { count('routings', 'skipped'); continue; }
    const r = await gm('POST', '/api/routings', { itemId: gid[code], operations: ops.map((o) => ({ seq: o.seq, code: o.code, nameEn: o.name.slice(0, 120), kind: o.kind, ...(o.cycleSec ? { cycleSec: o.cycleSec } : {}), mandatory: o.isMandatory })) });
    await gm('POST', `/api/routings/${r.id}/approve`, { version: (await gm('GET', `/api/routings/${r.id}`)).version });
    count('routings', 'created');
  }
  const exBoms = await gm('GET', '/api/boms?status=approved');
  const hasBom = new Set(exBoms.map((b) => b.item_code));
  for (const [code, lines] of model.boms) {
    if (hasBom.has(code)) { count('boms', 'skipped'); continue; }
    const stocked = lines.filter((l) => !l.service);
    const b = await gm('POST', '/api/boms', { itemId: gid[code], lines: stocked.map((l) => ({ componentId: gid[l.component], qtyPer: String(l.qty), opCode: l.op, scan: l.scan })) });
    await gm('POST', `/api/boms/${b.id}/approve`, { version: (await gm('GET', `/api/boms/${b.id}`)).version });
    count('boms', 'created');
  }
  for (const it of model.items.filter((i) => i.productionLine && i.procurement === 'make' && gid[i.code])) await gm('PUT', '/api/pln/item-lines', { itemId: gid[it.code], lines: [it.productionLine] });
  return done;
}

export function printProblems({ problems, warnings }, log = console.log) {
  for (const p of problems) log(`  ERROR   ${p.file}:${p.line}  ${p.message}`);
  for (const w of warnings) log(`  warning ${w.file}:${w.line}  ${w.message}`);
}
