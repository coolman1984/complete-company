// The book: everything the engine plays, taken from the deterministic generators in ../gen, cut to the window and scaled.
// Nothing here calls an application. `buildBook({ from, to, scale, models })` returns plain data; `node book.mjs --out book.json` writes it.
//
//   scale   share of the real volumes that is played (1 = the whole plant, 0.04 = one set in 25). People, machines and lead times do not scale:
//           a scaled run shows a plant that is under-loaded, in the proportions of the real one. The scale is written into the book and the report.
//   models  the finished items to play (default all six); their bills of materials pull in every component.
import { writeFileSync } from 'node:fs';
import { addDays, dateList, dayName, isWork, month, monthEnd, WINDOW, SEED, HOLIDAYS, rint, dow } from '../gen/lib.mjs';
import { ITEMS, IDX, BOMS, ROUTINGS, PLANT, SHIFTS, SUPPLIERS, SERVICE_VENDORS, CUSTOMERS, CUST, MODELS, SIZE, LINE_OF, CAP_FA, FX, FX_TABLE, netPrice, COMPANY, EXPORT_CIF, PALLET_QTY, SELL_IN, PLAN_FX,
  OC_MEMBERS, STD, TRUCK_QTY, PER_40HC } from '../gen/master.mjs';
import { DOMESTIC, EXPORT_ORDERS, MEGA, CYCLES, FORECASTS } from '../gen/demand.mjs';
import { ORG, JOBS, SKILLS, EMPLOYEES, POSITIONS, STATION_REQUIREMENTS, TEMPS, TEMP_PLAN, absentOn, activeOn, C_WINDOW } from '../gen/people.mjs';

const scaled = (qty, scale) => Math.max(0, Math.round(qty * scale));

/** Components of the chosen models: the closure of their bills of materials. */
function closure(models) {
  const need = new Set(models);
  const visit = (code) => { for (const l of BOMS[code]?.lines ?? []) { if (!need.has(l.component)) { need.add(l.component); visit(l.component); } } };
  for (const m of models) visit(m);
  return need;
}

export function buildBook(opts = {}) {
  const from = opts.from ?? WINDOW.from, to = opts.to ?? WINDOW.to, scale = opts.scale ?? 0.04;
  const models = opts.models ?? MODELS;
  const codes = closure(models);
  const items = ITEMS.filter((i) => codes.has(i.code));
  const bomOf = Object.fromEntries(Object.entries(BOMS).filter(([k]) => codes.has(k)));
  const routingOf = Object.fromEntries(Object.entries(ROUTINGS).filter(([k]) => codes.has(k)));
  const lines = new Set(Object.values(routingOf).flatMap((r) => r.lines));
  const suppliers = SUPPLIERS.filter((s) => items.some((i) => i.supplier === s.code));

  // ---- events, by day
  const events = [];
  const add = (date, kind, data) => { if (date >= from && date <= to) events.push({ date, kind, ...data }); };
  // demand plans: the consensus of each S&OP cycle, approved on its executive date (a cycle already approved before the window is approved on its first day)
  const cycleMap = { '2026-06': ['2026-06', 1], '2026-07': ['2026-07', 1], '2026-08X': ['2026-07', 2], '2026-08': ['2026-08', 1], '2026-09': ['2026-09', 1] };
  for (const [key, fc] of Object.entries(FORECASTS)) {
    const cy = CYCLES[key];
    if (!cy?.approved) continue;
    const date = cy.approved < from ? from : cy.approved;
    const rows = [];
    for (const [mk, row] of Object.entries(fc)) for (const m of models) if (row[m]) rows.push({ item: m, month: mk, qty: scaled(row[m], scale) });
    add(date, 'sop', { cycle: cycleMap[key][0], version: cycleMap[key][1], code: cy.code, rows: rows.filter((r) => r.qty > 0) });
  }
  // domestic orders: ordered `order_lead_days` before the delivery day the customer asked for
  for (const o of DOMESTIC) {
    const cu = CUST[o.customer];
    const order = addDays(o.request, -cu.order_lead_days);
    const date = order < from ? (o.request < from ? null : from) : order;
    if (!date || o.request > to) continue;
    const lines = Object.entries(o.lines).filter(([m]) => models.includes(m)).map(([m, q]) => ({ item: m, qty: scaled(q, scale), unit_price_egp: netPrice(o.customer, m), requested: o.request })).filter((l) => l.qty > 0);
    if (lines.length) add(date, 'sales_order', { customer: o.customer, channel: 'domestic', lines });
  }
  // export orders (containers), shipped on their ship date
  for (const e of EXPORT_ORDERS) {
    const lines = e.lines.filter((l) => models.includes(l.item)).map((l) => ({ item: l.item, qty: scaled(l.qty, scale), unit_price_usd: l.cif_usd, requested: e.ship_date })).filter((l) => l.qty > 0);
    if (lines.length) add(e.order_date < from ? from : e.order_date, 'sales_order', { customer: e.customer, channel: 'export', reference: e.key, lines });
  }
  // the White Friday order
  if (MEGA.lines.some((l) => models.includes(l.item))) {
    add(MEGA.order_date, 'sales_order', { customer: MEGA.customer, channel: 'mega', reference: MEGA.customer_po,
      lines: MEGA.lines.filter((l) => models.includes(l.item)).map((l) => ({ item: l.item, qty: scaled(l.qty, scale), unit_price_egp: MEGA.line_price(l.item), requested: l.requested_date })).filter((l) => l.qty > 0) });
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));

  // ---- daily facts the engine reads
  const days = dateList(from, to).map((d) => ({ date: d, work: isWork(d), holiday: HOLIDAYS[d] ?? null, fx_egp_per_usd: FX[d] }));
  const shiftsOn = (line, d) => (line === 'FA-2' && d >= C_WINDOW.from && d <= C_WINDOW.to ? ['A', 'B', 'C'] : ['A', 'B']);

  return {
    meta: { seed: SEED, window: { from, to }, scale, models, generator: 'complete-company/scenario/gen', note: 'volumes scaled by `scale`; people, lead times and prices are the plant\'s own' },
    company: { code: COMPANY.code, name: COMPANY.legal_name, vat_rate: COMPANY.vat_rate, plan_fx: PLAN_FX },
    suppliers: suppliers.map((s) => ({ code: s.code, name: s.name, currency: s.currency, terms: s.payment_terms, lead_days: s.planned_lead_time_days })),
    customers: CUSTOMERS.map((c) => ({ code: c.code, name: c.name, currency: c.currency, terms_days: c.terms_days ?? 0, credit_limit_egp: c.credit_limit_egp ?? null, pay_delay_mean: c.pay_delay_mean ?? 0, export: !!c.export })),
    items, boms: bomOf, routings: routingOf,
    plant: PLANT.filter((n) => n.type === 'plant' || n.type === 'area' || lines.has(n.code) || [...lines].some((l) => n.code.startsWith(l + '-') || n.parent === l || (n.type === 'equipment' && n.parent?.startsWith(l + '-')))),
    shifts: SHIFTS.map(({ code, name, start, end, rest_min }) => ({ code, name, start, end, rest_min })),
    calendar: { rest_weekday: 5, holidays: Object.entries(HOLIDAYS).filter(([d]) => d >= from && d <= to).map(([date, name]) => ({ date, name })) },
    capacity: { per_shift: Object.fromEntries(models.map((m) => [m, scaled(CAP_FA[m], 1)])), shifts_on: Object.fromEntries([...lines].map((l) => [l, dateList(from, to).filter((d) => isWork(d)).map((d) => [d, shiftsOn(l, d)])])) },
    packing: Object.fromEntries(models.map((m) => [m, { per_pallet: PALLET_QTY[SIZE[m]], per_truck: TRUCK_QTY[SIZE[m]], per_40hc: PER_40HC[SIZE[m]] }])),
    fx: days.map((d) => [d.date, d.fx_egp_per_usd]),
    people: { org: ORG, jobs: JOBS, skills: SKILLS, positions: POSITIONS, employees: EMPLOYEES, station_requirements: STATION_REQUIREMENTS, agency_temps: TEMPS.length, temp_plan: TEMP_PLAN },
    policies: {
      planner: { release_days_ahead: 3, note: 'a planned order is firmed and released when its start date is at most this many days away' },
      buyer: { review_days: 7, note: 'a requisition is converted when its order-by date is at most this many days away, per supplier' },
      billing: { post_invoices_same_day: true },
      hr: { horizon_days: 14, lead_days_to_hire: 5 },
    },
    events,
    days,
    checks: [],   // filled by the verifier from its fixed invariants; a book may add its own
    // the first calibration of the engine's simple plant (units are made and shipped in a fixed daily order, with no smoothing): wide ranges, tightened as the engine learns
    kpi_expected: { otif_domestic_key_accounts_pct: [70, 100], on_time_units_pct: [50, 100], fill_by_end_pct: [50, 100], oee_fa_pct: [0, 100] },
  };
}

if (import.meta.url === new URL(process.argv[1], 'file://').href || process.argv[1]?.endsWith('book.mjs')) {
  const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
  const book = buildBook({ from: arg('--from'), to: arg('--to'), scale: arg('--scale') ? Number(arg('--scale')) : undefined, models: arg('--models')?.split(',') });
  const out = arg('--out');
  if (out) writeFileSync(out, JSON.stringify(book, null, 1));
  console.log(`book ${book.meta.window.from}..${book.meta.window.to} scale ${book.meta.scale}: ${book.items.length} items, ${book.events.length} events (${book.events.filter((e) => e.kind === 'sales_order').length} orders, ${book.events.filter((e) => e.kind === 'sop').length} plans), ${book.people.employees.length} people`);
}
