// Demand: seasonality, S&OP cycles (forecasts), domestic sales orders, export orders, the White Friday mega order.
import { addDays, addMonths, dateList, dayName, isWork, prevWork, monthEnd, monthStart, month, U, rint, pad, sum, groupBy, r2, HOLIDAYS, clamp } from './lib.mjs';
import { MODELS, SIZE, ANNUAL_PLAN, PALLET_QTY, PER_40HC, CUSTOMERS, CUST, DOM, SELL_IN, EXPORT_CIF, netPrice, CARTON, GROSS_KG } from './master.mjs';

export const SEAS = { '2026-01': 1.15, '2026-02': 1.25, '2026-03': 0.95, '2026-04': 0.85, '2026-05': 1.00, '2026-06': 1.05, '2026-07': 0.85, '2026-08': 0.85, '2026-09': 0.95, '2026-10': 0.95, '2026-11': 1.25, '2026-12': 0.90 };   // research §4.5
export const EXPORT_MONTHLY_CONT = { 'NV-43U': 5, 'NV-50U': 2, 'NV-55U': 4, 'NV-55Q': 1, 'NV-65U': 4, 'NV-65Q': 0 };   // 40HC per month (programme)
export const EXPORT_PROG = Object.fromEntries(MODELS.map((m) => [m, EXPORT_MONTHLY_CONT[m] * PER_40HC[SIZE[m]]]));
export const DOM_ANNUAL = Object.fromEntries(MODELS.map((m) => [m, ANNUAL_PLAN[m] - 12 * EXPORT_PROG[m]]));   // sums with the export programme to the 280,000 plan
export const domBase = (m, mk) => DOM_ANNUAL[m] / 12 * SEAS[mk];

// actual domestic demand vs the statistical baseline (designed so that lag-1 SKU x month accuracy is near the research value 66 % and the forecast over-shoots ~ +6 %)
export const ACT = {
  '2026-07': { 'NV-43U': 0.62, 'NV-50U': 1.67, 'NV-55U': 0.76, 'NV-55Q': 0.48, 'NV-65U': 1.55, 'NV-65Q': 0.48 },
  '2026-08': { 'NV-43U': 1.60, 'NV-50U': 0.57, 'NV-55U': 0.69, 'NV-55Q': 1.64, 'NV-65U': 0.62, 'NV-65Q': 0.57 },
  '2026-09': { 'NV-43U': 0.64, 'NV-50U': 1.57, 'NV-55U': 1.60, 'NV-55Q': 0.48, 'NV-65U': 0.59, 'NV-65Q': 0.50 },
  '2026-10': { 'NV-43U': 0.95, 'NV-50U': 1.00, 'NV-55U': 1.02, 'NV-55Q': 0.95, 'NV-65U': 1.00, 'NV-65Q': 0.90 },
};
export const actFactor = (m, mk) => ACT[mk]?.[m] ?? (1 + (U('hist', m, mk) - 0.5) * 0.12);   // history months (Feb-Jun) fluctuate mildly
export const domActual = (m, mk) => domBase(m, mk) * actFactor(m, mk);

// consensus adjustment per S&OP cycle (sales/marketing judgement on top of the statistical baseline)
export const CYCLE_ADJ = {
  '2026-06': { 'NV-43U': 1.04, 'NV-50U': 1.02, 'NV-55U': 1.06, 'NV-55Q': 1.08, 'NV-65U': 1.05, 'NV-65Q': 1.10 },
  '2026-07': { 'NV-43U': 0.96, 'NV-50U': 1.10, 'NV-55U': 1.05, 'NV-55Q': 1.02, 'NV-65U': 1.08, 'NV-65Q': 0.96 },
  '2026-08': { 'NV-43U': 1.02, 'NV-50U': 1.06, 'NV-55U': 0.98, 'NV-55Q': 1.10, 'NV-65U': 1.04, 'NV-65Q': 0.92 },
  '2026-09': { 'NV-43U': 1.00, 'NV-50U': 1.04, 'NV-55U': 1.08, 'NV-55Q': 1.00, 'NV-65U': 1.02, 'NV-65Q': 0.95 },
};
export const CYCLES = {
  '2026-06': { code: 'DP-2026-06', data: '2026-06-06', demand_review: '2026-06-15', supply_review: '2026-06-22', pre_sop: '2026-06-23', exec_sop: '2026-06-25', approved: '2026-06-25', status: 'approved' },
  '2026-07': { code: 'DP-2026-07', data: '2026-07-04', demand_review: '2026-07-13', supply_review: '2026-07-20', pre_sop: '2026-07-21', exec_sop: '2026-07-27', approved: '2026-07-27', status: 'superseded' },
  '2026-08X': { code: 'DP-2026-07-X1', note: 'exceptional S&OP for the mega order', data: '2026-08-17', demand_review: '2026-08-17', supply_review: '2026-08-18', pre_sop: '2026-08-18', exec_sop: '2026-08-18', approved: '2026-08-18', status: 'superseded' },
  '2026-08': { code: 'DP-2026-08', data: '2026-08-01', demand_review: '2026-08-10', supply_review: '2026-08-17', pre_sop: '2026-08-20', exec_sop: '2026-08-27', approved: '2026-08-27', status: 'approved' },
  '2026-09': { code: 'DP-2026-09', data: '2026-09-01', demand_review: '2026-09-14', supply_review: '2026-09-21', pre_sop: '2026-09-23', exec_sop: '2026-09-30', approved: null, status: 'draft (executive S&OP scheduled 2026-09-30)' },
};

// ---------------------------------------------------------------- export orders
export const EXPORT_ORDERS = [
  ['KSA-2607A', 'C-AWT', '2026-06-10', '2026-06-18', '2026-07-08', { 'NV-43U': 2, 'NV-50U': 1, 'NV-55U': 2, 'NV-65U': 2 }, 'July wave 1'],
  ['IRQ-2607', 'C-TST', '2026-06-17', '2026-06-21', '2026-07-15', { 'NV-43U': 2, 'NV-55U': 1, 'NV-65U': 2 }, 'July'],
  ['KSA-2607B', 'C-AWT', '2026-06-24', '2026-07-02', '2026-07-22', { 'NV-43U': 1, 'NV-50U': 1, 'NV-55U': 1, 'NV-55Q': 1 }, 'July wave 2'],
  ['KSA-2608A', 'C-AWT', '2026-07-08', '2026-07-15', '2026-08-05', { 'NV-43U': 2, 'NV-50U': 1, 'NV-55U': 2, 'NV-65U': 2 }, 'August wave 1'],
  ['IRQ-2608', 'C-TST', '2026-07-15', '2026-07-19', '2026-08-12', { 'NV-43U': 2, 'NV-55U': 1, 'NV-65U': 1 }, 'August (one 65" container cut by the distributor for cash reasons)'],
  ['KSA-2608B', 'C-AWT', '2026-07-29', '2026-08-05', '2026-08-27', { 'NV-43U': 1, 'NV-50U': 1, 'NV-55U': 1, 'NV-55Q': 1 }, 'August wave 2 (26 Aug is a holiday: stuffing 27 Aug)'],
  ['KSA-2609', 'C-AWT', '2026-08-12', '2026-08-20', '2026-09-10', { 'NV-43U': 3, 'NV-50U': 2, 'NV-55U': 3, 'NV-55Q': 1, 'NV-65U': 1 }, 'STORY C: 10 x 40HC Q4 stocking order, LC at sight'],
  ['IRQ-2609', 'C-TST', '2026-08-19', '2026-08-23', '2026-09-16', { 'NV-43U': 2, 'NV-55U': 1, 'NV-65U': 2 }, 'September'],
  ['KSA-2610', 'C-AWT', '2026-09-15', '2026-09-22', '2026-10-07', { 'NV-43U': 2, 'NV-50U': 1, 'NV-55U': 2, 'NV-65U': 2 }, 'October wave 1 (open at the window end)'],
  ['IRQ-2610', 'C-TST', '2026-09-21', null, '2026-10-14', { 'NV-43U': 2, 'NV-55U': 1, 'NV-65U': 2 }, 'October (open; advance not yet received)'],
].map(([key, customer, order_date, lc_date, ship_date, containers, note]) => {
  const lines = MODELS.filter((m) => containers[m]).map((m) => ({ item: m, containers: containers[m], qty: containers[m] * PER_40HC[SIZE[m]], cif_usd: EXPORT_CIF[m] }));
  return { key, customer, order_date, lc_or_advance_date: lc_date, ship_date, lines, note, qty: sum(lines, (l) => l.qty), containers: sum(lines, (l) => l.containers), value_usd: r2(sum(lines, (l) => l.qty * l.cif_usd)) };
});

// ---------------------------------------------------------------- the mega order (story B)
export const MEGA = {
  customer: 'C-NME', customer_po: 'NME-PO-77812', order_date: '2026-08-17', order_time: '10:30', extra_discount_pct: 3.0, down_payment_pct: 15,
  campaign: "NME 'White Friday pre-season': stores stocked by 24 Sep for the 1 Oct campaign launch",
  terms: '15 % down payment by transfer within 3 days of confirmation; balance by post-dated cheques dated invoice + 60 days, handed over at each lot delivery',
  requested: [
    { lot: 1, date: '2026-09-03', 'NV-65U': 1700, 'NV-55Q': 1200 },
    { lot: 2, date: '2026-09-14', 'NV-65U': 1700, 'NV-55Q': 1200 },
    { lot: 3, date: '2026-09-24', 'NV-65U': 1600, 'NV-55Q': 1200 },
  ],
  // confirmed (promised) dates after the decisions of 18-19 Aug
  lines: [
    { line_no: 10, lot: 1, item: 'NV-65U', qty: 1700, requested_date: '2026-09-03', promised_date: '2026-09-03' },
    { line_no: 20, lot: 1, item: 'NV-55Q', qty: 1200, requested_date: '2026-09-03', promised_date: '2026-09-03' },
    { line_no: 30, lot: 2, item: 'NV-65U', qty: 1700, requested_date: '2026-09-14', promised_date: '2026-09-14' },
    { line_no: 40, lot: 2, item: 'NV-55Q', qty: 1200, requested_date: '2026-09-14', promised_date: '2026-09-14' },
    { line_no: 50, lot: 3, item: 'NV-65U', qty: 1600, requested_date: '2026-09-24', promised_date: '2026-09-24' },
    { line_no: 60, lot: 3, item: 'NV-55Q', qty: 600, requested_date: '2026-09-24', promised_date: '2026-09-24' },
    { line_no: 70, lot: 4, item: 'NV-55Q', qty: 600, requested_date: '2026-09-24', promised_date: '2026-10-08', note: 'deferred to lot 4 by agreement of 2026-08-19: open cells for these sets cannot arrive in time even by air (see events)' },
  ],
  // what the planner sees at order time (ATP): filled by the simulation (plan.mjs)
};
MEGA.total = { 'NV-65U': 5000, 'NV-55Q': 3600 };
MEGA.total_qty = 8600;
MEGA.line_price = (item) => r2(SELL_IN[item] * (1 - (CUST['C-NME'].discount_pct + MEGA.extra_discount_pct) / 100));
MEGA.value_egp = sum(MEGA.lines, (l) => l.qty * MEGA.line_price(l.item));
export const MEGA_SCRIPT = {
  partial_hold: { date: '2026-09-23', line_no: 50, qty: 200, released: '2026-09-26', reason: 'carton label error found at OQC on 200 x NV-65U of lot 3: re-pack, released Saturday 26 Sep' },
  c_window: { from: '2026-08-29', to: '2026-09-24' },
};

// ---------------------------------------------------------------- domestic sales orders
function weights(keys, salt) { return keys.map((k) => 0.75 + 0.5 * U('w', salt, k)); }
function allocate(units, w) {   // largest-remainder split of an integer over weights
  const tot = sum(w); const raw = w.map((x) => units * x / tot); const fl = raw.map(Math.floor); let rest = units - sum(fl);
  raw.map((r, i) => [r - fl[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (rest > 0) { fl[i]++; rest--; } });
  return fl;
}
export const DOMESTIC = [];   // {customer, request, lines: {model: qty}}
{
  const months = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  for (const mk of months) {
    const perCust = {};
    for (const m of MODELS) {
      const act = domActual(m, mk);
      const raw = DOM.map((c) => CUST[c].share * CUST[c].tilt[m]); const t = sum(raw);
      const pallets = DOM.map((c, i) => Math.round(act * raw[i] / t / PALLET_QTY[SIZE[m]]));
      DOM.forEach((c, i) => { (perCust[c] ??= {})[m] = pallets[i]; });
    }
    for (const c of DOM) {
      const cu = CUST[c];
      const days = dateList(monthStart(mk), monthEnd(mk)).filter((d) => isWork(d) && cu.delivery_days.includes(dayName(d)));
      for (const m of MODELS) {
        const pal = allocate(perCust[c][m], weights(days, `${c}|${m}`));
        days.forEach((d, i) => { if (pal[i] > 0) { let o = DOMESTIC.find((x) => x.customer === c && x.request === d); if (!o) { o = { customer: c, request: d, lines: {} }; DOMESTIC.push(o); } o.lines[m] = pal[i] * PALLET_QTY[SIZE[m]]; } });
      }
    }
  }
}

// ---------------------------------------------------------------- forecasts per cycle
export const nextMonths = (mk, n) => Array.from({ length: n }, (_, i) => addMonths(mk, i + 1));
export function exportFirm(mk) { const q = Object.fromEntries(MODELS.map((m) => [m, 0])); for (const o of EXPORT_ORDERS) if (o.ship_date.startsWith(mk)) for (const l of o.lines) q[l.item] += l.qty; return q; }
export const FORECASTS = {};
for (const [key, cyc] of Object.entries({ '2026-06': '2026-06', '2026-07': '2026-07', '2026-08X': '2026-07', '2026-08': '2026-08', '2026-09': '2026-09' })) {
  const out = {};
  const base = key === '2026-08X' ? '2026-07' : key;
  const mega = key === '2026-08X' || key === '2026-08' || key === '2026-09';
  for (const mk of nextMonths(base, 6)) {
    const row = {};
    for (const m of MODELS) {
      let q = domBase(m, mk) * CYCLE_ADJ[cyc][m];
      const firmExp = exportFirm(mk); q += (key === '2026-06' || key === '2026-07') ? EXPORT_PROG[m] : Math.max(EXPORT_PROG[m], firmExp[m]);
      if (mega) { if (mk === '2026-09') q += MEGA.lines.filter((l) => l.item === m && l.promised_date.startsWith('2026-09')).reduce((s, l) => s + l.qty, 0); if (mk === '2026-10') q += MEGA.lines.filter((l) => l.item === m && l.promised_date.startsWith('2026-10')).reduce((s, l) => s + l.qty, 0); }
      row[m] = rint(q);
    }
    out[mk] = row;
  }
  FORECASTS[key] = out;
}
export const activePlanKey = (d) => d >= '2026-08-27' ? '2026-08' : d >= '2026-08-18' ? '2026-08X' : d >= '2026-07-27' ? '2026-07' : '2026-06';
// actual (all channels) per model and month, for the forecast-accuracy KPI (mega excluded / included)
export function actualMonth(m, mk, includeMega = true) {
  let q = domActual(m, mk);
  for (const o of EXPORT_ORDERS) if (o.ship_date.startsWith(mk)) for (const l of o.lines) if (l.item === m) q += l.qty;
  if (includeMega) for (const l of MEGA.lines) if (l.item === m && l.promised_date.startsWith(mk)) q += l.qty;
  return q;
}
