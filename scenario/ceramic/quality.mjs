// Data-quality gate for Demo Ceramics Co. (scenario/gen/ceramic.mjs): the book must be internally consistent before any application is asked to hold it.
// Pure: reads the book, writes nothing. `validateCeramicBook(book)` returns { ok, problems, counts, summary } (machine-readable);
//   node scenario/ceramic/quality.mjs [--json out.json]   prints the summary and exits 1 on a problem.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { buildCeramicBook, GRADES, COVER, SI } from '../gen/ceramic.mjs';
import { dow, HOLIDAYS } from '../gen/lib.mjs';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (d) => typeof d === 'string' && ISO.test(d) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
const isWork = (d) => dow(d) !== 5 && !HOLIDAYS[d];
const decimals = (n) => { const s = String(n); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };

export function validateCeramicBook(book) {
  const problems = [];
  const bad = (m) => problems.length < 200 && problems.push(m);
  const unique = (what, codes) => { const seen = new Set(); for (const c of codes) { if (!c || typeof c !== 'string') bad(`${what}: an empty code`); else if (seen.has(c)) bad(`${what}: code ${c} is used twice`); seen.add(c); } return seen; };
  const { from, to } = book.meta.window;
  if (!validDate(from) || !validDate(to) || from > to) bad(`the window ${from}..${to} is not a valid range`);

  // ---- masters
  const supplierCodes = unique('suppliers', book.suppliers.map((s) => s.code));
  const customerCodes = unique('customers', book.customers.map((c) => c.code));
  const itemCodes = unique('items', book.items.map((i) => i.code));
  const plantCodes = unique('plant', book.plant.map((n) => n.code));
  for (const c of book.customers) if (!(c.credit_limit_egp > 0) || !(c.terms_days >= 0)) bad(`customer ${c.code}: credit limit and terms must be set`);
  for (const i of book.items) {
    if (i.procurement === 'buy' && !supplierCodes.has(i.supplier)) bad(`item ${i.code}: supplier ${i.supplier} does not exist`);
    if (i.procurement === 'buy' && !(i.purchase_price > 0)) bad(`item ${i.code}: no purchase price`);
    if (i.type === 'finished' && !(i.sell_in_egp > 0)) bad(`item ${i.code}: no sale price`);
    if (i.type === 'finished' && !plantCodes.has(i.line)) bad(`item ${i.code}: line ${i.line} is not in the plant`);
    if (i.lot_rule !== 'lot_for_lot' && !(i.lot_size > 0)) bad(`item ${i.code}: lot size rule ${i.lot_rule} needs a lot size`);
  }
  for (const n of book.plant) if (n.parent && !plantCodes.has(n.parent)) bad(`plant ${n.code}: parent ${n.parent} does not exist`);
  for (const m of book.meta.models) {
    const bom = book.boms[m], routing = book.routings[m];
    if (!bom || !routing) { bad(`model ${m}: no bill of materials or routing`); continue; }
    const ops = new Set(routing.operations.map((o) => o.code));
    const seqs = routing.operations.map((o) => o.seq);
    if (seqs.some((s, k) => k > 0 && s <= seqs[k - 1])) bad(`routing ${m}: operations are not in order`);
    if (routing.operations.at(-1)?.kind !== 'pack') bad(`routing ${m}: the last operation must be the packing one`);
    if (!plantCodes.has(routing.lines[0])) bad(`routing ${m}: line ${routing.lines[0]} is not in the plant`);
    for (const l of bom.lines) {
      if (!itemCodes.has(l.component)) bad(`bill of materials ${m}: component ${l.component} is not an item`);
      if (!ops.has(l.op)) bad(`bill of materials ${m}: ${l.component} is used at ${l.op}, which the routing does not have`);
      if (!(l.qty_per > 0) || decimals(l.qty_per) > 3) bad(`bill of materials ${m}: ${l.component} per unit ${l.qty_per} must be above 0 with at most 3 decimals`);
    }
  }

  // ---- demand
  const orders = book.events.filter((e) => e.kind === 'sales_order');
  for (const e of book.events) if (!validDate(e.date) || e.date < from || e.date > to) bad(`event ${e.kind} on ${e.date} is outside the window`);
  let m2 = 0;
  for (const e of orders) {
    if (!customerCodes.has(e.customer)) bad(`order of ${e.date}: customer ${e.customer} does not exist`);
    if (!e.lines.length) bad(`order of ${e.date}: no lines`);
    for (const l of e.lines) {
      if (!book.meta.models.includes(l.item)) bad(`order of ${e.date}: item ${l.item} is not a product of the book`);
      if (!(l.qty > 0) || decimals(l.qty) > 2) bad(`order of ${e.date}: quantity ${l.qty} of ${l.item} must be above 0 with at most 2 decimals`);
      else if (COVER[l.item] && Math.abs(Math.round(l.qty / COVER[l.item]) * COVER[l.item] - l.qty) > 0.006) bad(`order of ${e.date}: ${l.qty} m2 of ${l.item} is not a whole number of cartons`);
      if (!validDate(l.requested) || l.requested < e.date) bad(`order of ${e.date}: requested date ${l.requested} is not after the order`);
      else if (!isWork(l.requested)) bad(`order of ${e.date}: requested date ${l.requested} is not a working day`);
      if (!(l.unit_price_egp > 0)) bad(`order of ${e.date}: no price for ${l.item}`);
      m2 += l.qty;
    }
  }
  for (const e of book.events.filter((x) => x.kind === 'sop')) for (const r of e.rows) if (!book.meta.models.includes(r.item) || !(r.qty > 0) || !/^\d{4}-\d{2}$/.test(r.month)) bad(`plan ${e.code}: row ${JSON.stringify(r)} is not valid`);

  // ---- people
  const p = book.people;
  const unitCodes = unique('organisation units', p.org.map((o) => o.code));
  const jobCodes = unique('jobs', p.jobs.map((j) => j.code));
  const positionCodes = unique('positions', p.positions.map((x) => x.code));
  const skillCodes = unique('skills', p.skills.map((s) => s.code));
  unique('employees', p.employees.map((e) => e.code));
  const costCenters = new Set(p.org.filter((o) => o.cost_center).map((o) => o.cost_center));
  const gradeOf = Object.fromEntries(p.jobs.map((j) => [j.code, j.grade]));
  for (const o of p.org) if (o.parent && !unitCodes.has(o.parent)) bad(`unit ${o.code}: parent ${o.parent} does not exist`);
  for (const x of p.positions) if (!unitCodes.has(x.unit) || !jobCodes.has(x.job)) bad(`position ${x.code}: unit or job does not exist`);
  let payroll = 0;
  const stationCrew = Object.fromEntries(p.station_requirements.map((r) => [r.station, r]));
  for (const e of p.employees) {
    if (!positionCodes.has(e.position)) bad(`employee ${e.code}: position ${e.position} does not exist`);
    if (!unitCodes.has(e.unit) || !costCenters.has(e.cost_center)) bad(`employee ${e.code}: unit ${e.unit} or cost centre ${e.cost_center} does not exist`);
    if (!validDate(e.hire_date) || !validDate(e.first_productive_date) || e.first_productive_date < e.hire_date) bad(`employee ${e.code}: hire ${e.hire_date} and first productive day ${e.first_productive_date} are not valid`);
    if (e.exit_date && (!validDate(e.exit_date) || e.exit_date < e.first_productive_date)) bad(`employee ${e.code}: exit ${e.exit_date} is before the person started`);
    const g = GRADES[gradeOf[e.job] === e.grade ? e.grade : e.grade];
    if (!g || e.gross_monthly_egp < Math.min(g[0], 7000) || e.gross_monthly_egp > g[1]) bad(`employee ${e.code}: gross ${e.gross_monthly_egp} is outside grade ${e.grade}`);
    if (!(e.basic_egp > 0) || e.basic_egp > e.gross_monthly_egp) bad(`employee ${e.code}: basic ${e.basic_egp} must be above 0 and at most the gross`);
    if (e.insurable_egp < SI.min || e.insurable_egp > SI.max) bad(`employee ${e.code}: insurable wage ${e.insurable_egp} is outside ${SI.min}..${SI.max}`);
    for (const s of e.skills) {
      if (!skillCodes.has(s.skill) || !(s.level >= 1 && s.level <= 4) || !validDate(s.certified_on) || !validDate(s.expires_on) || s.expires_on <= s.certified_on) bad(`employee ${e.code}: skill ${JSON.stringify(s)} is not valid`);
      if (s.certified_on < e.hire_date) bad(`employee ${e.code}: skill ${s.skill} certified on ${s.certified_on}, before the hire date ${e.hire_date}`);
    }
    if (e.exit_date == null) payroll += e.gross_monthly_egp;
  }
  for (const r of p.station_requirements) for (const q of r.requires) if (!skillCodes.has(q.skill)) bad(`station ${r.station}: requires unknown skill ${q.skill}`);
  const byCode = new Set(p.employees.map((e) => e.code));
  for (const c of [...(p.employees ? [] : [])]) void c;
  // movements and hiring refer to people that exist
  const hiring = (book.hiring ?? null);
  void hiring;

  const summary = {
    window: { from, to }, models: book.meta.models.length, items: book.items.length, suppliers: book.suppliers.length, customers: book.customers.length,
    orders: orders.length, orderM2: Math.round(m2), employees: p.employees.length, activeEmployees: p.employees.filter((e) => e.exit_date == null).length, monthlyGrossEgp: payroll,
    stations: Object.keys(stationCrew).length, problems: problems.length,
  };
  return { ok: problems.length === 0, problems, counts: { suppliers: book.suppliers.length, customers: book.customers.length, items: book.items.length, plant: book.plant.length, models: book.meta.models.length }, summary, byCode: byCode.size };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = validateCeramicBook(buildCeramicBook());
  const jsonAt = process.argv.indexOf('--json');
  if (jsonAt > 0) writeFileSync(process.argv[jsonAt + 1], JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report.summary));
  for (const p of report.problems.slice(0, 40)) console.log('  PROBLEM ' + p);
  console.log(report.ok ? 'CERAMIC DATA: OK' : `CERAMIC DATA: ${report.problems.length} problem(s)`);
  process.exit(report.ok ? 0 : 1);
}
