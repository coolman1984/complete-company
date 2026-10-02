// Demo Ceramics Co. (code DCER): an invented tile factory, every number made up and deterministic (same seed, same data).
// It gives the scenario engine the same shape of "book" the electronics generator gives, plus the people model HR lives through:
//   * four tile products on two lines (porcelain 60x60 white and grey, wall tile 30x60, wood-look plank 20x90), ten raw materials, three suppliers
//   * eight distributors and a project developer, a monthly S&OP plan and orders spread over the window
//   * about 145 people with grades, salaries, shifts, qualifications, leave, turnover with hiring, and overtime
// Salaries here are SAMPLE data (invented, in the range of Egyptian industrial wages): they are the input of the payroll the engine runs.
// Nothing here calls an application. Usage: node ceramic.mjs   (prints a summary)
import { addDays, addMonths, addWork, nextWork, dateList, dow, isWork, U, pad, HOLIDAYS, SEED } from './lib.mjs';

export const WINDOW = { from: '2026-07-01', to: '2026-10-02' };   // up to the day the owner starts the trial: nothing is dated after it
export const COMPANY = { code: 'DCER', legal_name: 'Demo Ceramics Co.', vat_rate: 0.14, plan_fx: 50 };
export const C_WINDOW = { from: '9999-01-01', to: '9999-01-01', line: null, shift: 'C' };   // no temporary night crew in this plant

// ---------------------------------------------------------------- suppliers, items, bills of materials, routings, plant
export const SUPPLIERS = [
  { code: 'S-CLAY', name: 'Aswan Clay & Minerals', currency: 'EGP', payment_terms: 'NET30', planned_lead_time_days: 7 },
  { code: 'S-GLZ', name: 'Frit & Glaze Supplies', currency: 'EGP', payment_terms: 'NET45', planned_lead_time_days: 10 },
  { code: 'S-CTN', name: 'Delta Carton Works', currency: 'EGP', payment_terms: 'NET15', planned_lead_time_days: 5 },
];
const raw = (code, name, ar, uom, lead, supplier, price, extra = {}) => ({ code, name_en: name, name_ar: ar, type: extra.packaging ? 'packaging' : 'raw', uom, procurement: 'buy', lead_time_days: lead, moq: extra.moq ?? 0, lot_rule: extra.lot ? 'multiple' : 'lot_for_lot', lot_size: extra.lot ?? 0, safety_stock: extra.safety ?? 0, supplier, purchase_price: price, iqc: !!extra.iqc });
const tile = (code, name, ar, price, line) => ({ code, name_en: name, name_ar: ar, type: 'finished', uom: 'M2', procurement: 'make', lead_time_days: 1, moq: 0, lot_rule: 'lot_for_lot', lot_size: 0, supplier: null, sell_in_egp: price, line, batch_output: true });
export const ITEMS = [
  raw('CLAY-RED', 'Red clay', 'طفلة حمراء', 'KG', 7, 'S-CLAY', 1.5, { iqc: true, safety: 340000, lot: 100000 }),
  raw('FELDSPAR', 'Feldspar', 'فلسبار', 'KG', 7, 'S-CLAY', 3, { safety: 75000, lot: 25000 }),
  raw('KAOLIN', 'Kaolin', 'كاولين', 'KG', 7, 'S-CLAY', 5, { iqc: true, safety: 40000, lot: 10000 }),
  raw('GLZ-WHT', 'White glaze', 'جليز أبيض', 'KG', 10, 'S-GLZ', 45, { iqc: true, moq: 500, safety: 8000, lot: 2000 }),
  raw('GLZ-GRY', 'Grey glaze', 'جليز رمادي', 'KG', 10, 'S-GLZ', 48, { iqc: true, moq: 500, safety: 4500, lot: 1000 }),
  raw('GLZ-BGE', 'Beige glaze', 'جليز بيج', 'KG', 10, 'S-GLZ', 46, { iqc: true, moq: 500, safety: 3500, lot: 1000 }),
  raw('INK-OAK', 'Digital ink, oak pattern', 'حبر رقمي بلوط', 'KG', 14, 'S-GLZ', 180, { iqc: true, moq: 100, safety: 200, lot: 100 }),
  raw('CTN-60', 'Carton 60x60 (1.44 m2)', 'كرتونة ٦٠×٦٠', 'PCS', 5, 'S-CTN', 12, { packaging: true, moq: 1000, safety: 9000, lot: 5000 }),
  raw('CTN-3060', 'Carton 30x60 (1.62 m2)', 'كرتونة ٣٠×٦٠', 'PCS', 5, 'S-CTN', 11, { packaging: true, moq: 1000, safety: 3000, lot: 2000 }),
  raw('CTN-2090', 'Carton 20x90 (1.44 m2)', 'كرتونة ٢٠×٩٠', 'PCS', 5, 'S-CTN', 13, { packaging: true, moq: 1000, safety: 2000, lot: 1000 }),
  tile('TL-6060-WHT', 'Porcelain tile 60x60 white, 1st grade', 'بورسلين ٦٠×٦٠ أبيض فرز أول', 320, 'L1'),
  tile('TL-6060-GRY', 'Porcelain tile 60x60 grey, 1st grade', 'بورسلين ٦٠×٦٠ رمادي فرز أول', 335, 'L1'),
  tile('TL-3060-BGE', 'Wall tile 30x60 beige glossy, 1st grade', 'سيراميك حائط ٣٠×٦٠ بيج لامع فرز أول', 255, 'L2'),
  tile('TL-2090-OAK', 'Wood-look porcelain plank 20x90 oak, 1st grade', 'بورسلين خشبي ٢٠×٩٠ بلوط فرز أول', 380, 'L2'),
];
export const MODELS = ITEMS.filter((i) => i.type === 'finished').map((i) => i.code);
const L = (component, qty_per, op) => ({ component, qty_per, op, scan: 'lot' });
export const BOMS = {
  'TL-6060-WHT': { lines: [L('CLAY-RED', 18, 'PR'), L('FELDSPAR', 4, 'PR'), L('KAOLIN', 2, 'PR'), L('GLZ-WHT', 0.8, 'GL'), L('CTN-60', 0.7, 'SP')] },
  'TL-6060-GRY': { lines: [L('CLAY-RED', 18, 'PR'), L('FELDSPAR', 4, 'PR'), L('KAOLIN', 2, 'PR'), L('GLZ-GRY', 0.8, 'GL'), L('CTN-60', 0.7, 'SP')] },
  'TL-3060-BGE': { lines: [L('CLAY-RED', 14, 'PR'), L('FELDSPAR', 3, 'PR'), L('KAOLIN', 1.5, 'PR'), L('GLZ-BGE', 0.7, 'GL'), L('CTN-3060', 0.62, 'SP')] },
  'TL-2090-OAK': { lines: [L('CLAY-RED', 19, 'PR'), L('FELDSPAR', 4.2, 'PR'), L('KAOLIN', 2, 'PR'), L('GLZ-WHT', 0.5, 'GL'), L('INK-OAK', 0.06, 'GL'), L('CTN-2090', 0.7, 'SP')] },
};
// Cartons per m2 include a small packing reserve: 0.8% for 1.44 m2 cartons,
// 0.44% for 1.62 m2 cartons. Application quantities support three decimals.
const OPS = [['PR', 'Pressing', 'work', 4], ['DR', 'Drying', 'work', 6], ['GL', 'Glazing and printing', 'work', 5], ['KL', 'Kiln firing', 'work', 50], ['SP', 'Sorting and packing', 'pack', 6]];
export const ROUTINGS = Object.fromEntries(MODELS.map((m) => [m, { lines: [ITEMS.find((i) => i.code === m).line], operations: OPS.map(([code, name, kind, cycle_s], i) => ({ seq: (i + 1) * 10, code, name, kind, cycle_s })) }]));
export const PLANT = [
  { code: 'DC1', type: 'plant', parent: null, name: 'Ceramics plant' }, { code: 'FL', type: 'area', parent: 'DC1', name: 'Floor tiles' }, { code: 'WL', type: 'area', parent: 'DC1', name: 'Wall tiles and planks' },
  { code: 'L1', type: 'line', parent: 'FL', name: 'Tile line 1', capacity_per_shift: 2400 }, { code: 'L2', type: 'line', parent: 'WL', name: 'Tile line 2', capacity_per_shift: 1800 },
  ...['L1', 'L2'].flatMap((line) => OPS.map(([code, name]) => ({ code: `${line}-${code}`, type: 'station', parent: line, name }))),
];
export const SHIFTS = [{ code: 'A', name: 'Day', start: '07:00', end: '15:00', rest_min: 40 }, { code: 'B', name: 'Evening', start: '15:00', end: '23:00', rest_min: 40 }, { code: 'C', name: 'Night', start: '23:00', end: '07:00', rest_min: 40 }];
export const CAP_PER_SHIFT = { 'TL-6060-WHT': 2400, 'TL-6060-GRY': 2400, 'TL-3060-BGE': 2000, 'TL-2090-OAK': 1600 };   // m2 a full shift makes of the product
export const COVER = { 'TL-6060-WHT': 1.44, 'TL-6060-GRY': 1.44, 'TL-3060-BGE': 1.62, 'TL-2090-OAK': 1.44 };            // m2 in one carton
export const LOSS = { 'TL-6060-WHT': 0.040, 'TL-6060-GRY': 0.045, 'TL-3060-BGE': 0.035, 'TL-2090-OAK': 0.055 };          // share of the pressed m2 that is lost
export const SCRAP_REASONS = [['kiln-crack', 0.4], ['press-lamination', 0.2], ['downgrade', 0.4]];

// ---------------------------------------------------------------- customers and demand
export const CUSTOMERS = [
  { code: 'C-DELTA', name: 'Delta Building Materials', currency: 'EGP', terms_days: 30, credit_limit_egp: 9_000_000, pay_delay_mean: 12, weight: 16 },
  { code: 'C-CAIRO', name: 'Cairo Home Centers', currency: 'EGP', terms_days: 45, credit_limit_egp: 14_000_000, pay_delay_mean: 20, weight: 22 },
  { code: 'C-ALEX', name: 'Alexandria Tiles House', currency: 'EGP', terms_days: 30, credit_limit_egp: 7_000_000, pay_delay_mean: 10, weight: 12 },
  { code: 'C-UPPER', name: 'Upper Egypt Builders Supply', currency: 'EGP', terms_days: 60, credit_limit_egp: 6_000_000, pay_delay_mean: 25, weight: 8 },
  { code: 'C-CANAL', name: 'Canal Ceramics Trading', currency: 'EGP', terms_days: 30, credit_limit_egp: 6_000_000, pay_delay_mean: 8, weight: 10 },
  { code: 'C-NILE', name: 'Nile Delta Contractors', currency: 'EGP', terms_days: 45, credit_limit_egp: 8_000_000, pay_delay_mean: 18, weight: 14 },
  { code: 'C-GIZA', name: 'Giza Interiors Retail', currency: 'EGP', terms_days: 15, credit_limit_egp: 4_000_000, pay_delay_mean: 5, weight: 6 },
  { code: 'C-RSEA', name: 'Red Sea Developments', currency: 'EGP', terms_days: 60, credit_limit_egp: 20_000_000, pay_delay_mean: 30, weight: 12 },
];
// what the sales team forecasts to sell each month (m2), by product; the real demand follows it with noise
export const MONTHLY_M2 = { 'TL-6060-WHT': 39000, 'TL-6060-GRY': 27000, 'TL-3060-BGE': 24000, 'TL-2090-OAK': 13500 };
const SEASON = { '2026-07': 0.92, '2026-08': 1.0, '2026-09': 1.12, '2026-10': 1.05, '2026-11': 1.0, '2026-12': 0.95 };
const monthsOf = (a, b) => { const out = []; for (let d = a.slice(0, 7); d <= b.slice(0, 7); d = addDays(d + '-01', 32).slice(0, 7)) out.push(d); return out; };
const cartons = (item, m2) => Math.max(1, Math.round(m2 / COVER[item]));
const unitPrice = (customer, item) => { const base = ITEMS.find((i) => i.code === item).sell_in_egp; const disc = { 'C-CAIRO': 0.06, 'C-RSEA': 0.09, 'C-DELTA': 0.04, 'C-NILE': 0.05 }[customer] ?? 0.02; return Math.round(base * (1 - disc) * 100) / 100; };

/** Orders of the window: per product and month the forecast is split among the customers by weight, into orders of about 1,500 m2 on days drawn from the month. */
export function salesOrders(from, to) {
  const orders = [];
  const totalW = CUSTOMERS.reduce((a, c) => a + c.weight, 0);
  for (const month of monthsOf(from, to)) {
    const days = dateList(month + '-01', addDays(addDays(month + '-01', 32).slice(0, 7) + '-01', -1)).filter(isWork);
    for (const item of MODELS) {
      const target = MONTHLY_M2[item] * (SEASON[month] ?? 1) * (0.94 + 0.12 * U('demand', month, item));
      for (const c of CUSTOMERS) {
        const share = target * c.weight / totalW;
        const n = Math.max(1, Math.round(share / 1500));
        for (let i = 0; i < n; i++) {
          const day = days[Math.floor(U('od', month, item, c.code, i) * days.length)];
          if (day < from || day > to) continue;
          const qty = cartons(item, share / n * (0.8 + 0.4 * U('oq', month, item, c.code, i))) * COVER[item];
          orders.push({ date: day, customer: c.code, item, qty: Math.round(qty * 100) / 100, requested: nextWork(addDays(day, 10 + Math.floor(U('rq', month, item, c.code, i) * 15))) });
        }
      }
    }
  }
  // the project order: a developer buys a whole block's flooring in August, delivery in three weeks
  const project = { date: '2026-08-10', customer: 'C-RSEA', lines: [['TL-6060-WHT', 6000], ['TL-2090-OAK', 3200], ['TL-3060-BGE', 2400]].map(([item, m2]) => [item, Math.round(Math.ceil(m2 / COVER[item]) * COVER[item] * 100) / 100]), requested: '2026-08-31', ref: 'RSD-BLOCK-7' };
  return { orders: orders.filter((o) => o.date >= from && o.date <= to), project };
}

// ---------------------------------------------------------------- people: organisation, jobs, headcount, salaries
export const SI = { ee: 0.11, er: 0.1875, min: 2700, max: 16700, basic_share: 0.65 };   // the same social-insurance figures HR's payroll uses
export const GRADES = { G1: [7000, 8500, 7600], G2: [8500, 11000, 9500], G3: [10500, 14500, 12200], G4: [13000, 19000, 15500], G5: [17000, 25000, 20500], G6: [24000, 38000, 30000], G7: [40000, 65000, 52000], G8: [75000, 140000, 100000] };
export const SKILLS = [
  { code: 'SAFE', name: 'Plant safety induction and PPE (hearing, eyes, kiln heat)', levels: 4, validity_months: 12, mandatory_for: 'all_production' },
  { code: 'PRESS', name: 'Press operation and mould change', levels: 4, validity_months: 24 },
  { code: 'GLAZE', name: 'Glazing and digital printing line operation', levels: 4, validity_months: 24 },
  { code: 'KILN', name: 'Roller kiln operation and firing curves', levels: 4, validity_months: 24 },
  { code: 'SORT', name: 'Tile sorting, shade and caliber grading', levels: 4, validity_months: 24 },
  { code: 'DRYER', name: 'Dryer operation', levels: 4, validity_months: 24 },
  { code: 'MILL', name: 'Ball mill and spray dryer (body preparation)', levels: 4, validity_months: 24 },
  { code: 'FORK', name: 'Forklift licence', levels: 4, validity_months: 36 },
  { code: 'LEAD', name: 'Line leader', levels: 4, validity_months: 36 },
  { code: 'LAB', name: 'Ceramic laboratory testing (absorption, breaking strength)', levels: 4, validity_months: 24 },
];
const OPSKILL = { PR: 'PRESS', DR: 'DRYER', GL: 'GLAZE', KL: 'KILN', SP: 'SORT', MILL: 'MILL' };
const CREW = { 'L1-PR': 3, 'L1-DR': 1, 'L1-GL': 4, 'L1-KL': 2, 'L1-SP': 8, 'L2-PR': 3, 'L2-DR': 1, 'L2-GL': 5, 'L2-KL': 2, 'L2-SP': 7 };   // heads a station needs on one shift
export const STATION_REQUIREMENTS = Object.entries(CREW).map(([station, crew]) => ({ station, crew, requires: [{ skill: 'SAFE', min_level: 2 }, { skill: OPSKILL[station.slice(3)], min_level: 2 }] }));
export const JOBS = [
  ['J-PRS', 'Press operator', 'G2', 'direct'], ['J-DRY', 'Dryer attendant', 'G2', 'direct'], ['J-GLZ', 'Glaze line operator', 'G2', 'direct'], ['J-KLN', 'Kiln operator', 'G3', 'direct'], ['J-SRT', 'Sorter / packer', 'G1', 'direct'],
  ['J-LDR', 'Line leader', 'G3', 'direct'], ['J-MIL', 'Body preparation operator', 'G2', 'direct'], ['J-FLT', 'Forklift driver', 'G2', 'direct'], ['J-REL', 'Relief operator', 'G2', 'direct'],
  ['J-WHK', 'Storekeeper', 'G2', 'indirect'], ['J-REC', 'Receiving clerk', 'G3', 'indirect'], ['J-SHIP', 'Shipping clerk', 'G3', 'indirect'], ['J-WHS', 'Warehouse supervisor', 'G6', 'indirect'],
  ['J-IQC', 'Incoming inspector', 'G3', 'indirect'], ['J-OQC', 'Final quality inspector', 'G3', 'indirect'], ['J-LAB', 'Lab technician', 'G4', 'indirect'], ['J-QE', 'Quality engineer', 'G5', 'indirect'], ['J-QM', 'Quality manager', 'G7', 'indirect'],
  ['J-MTC', 'Maintenance technician', 'G4', 'indirect'], ['J-MEN', 'Maintenance engineer', 'G5', 'indirect'], ['J-MM', 'Maintenance manager', 'G7', 'indirect'],
  ['J-PE', 'Process engineer (glaze and body)', 'G5', 'indirect'], ['J-DSN', 'Tile designer', 'G5', 'indirect'], ['J-EM', 'Technical manager', 'G7', 'indirect'],
  ['J-PM', 'Plant manager', 'G8', 'indirect'], ['J-SUP', 'Production supervisor', 'G6', 'indirect'],
  ['J-SCM', 'Supply chain manager', 'G7', 'indirect'], ['J-PLN', 'Production planner', 'G4', 'indirect'], ['J-BUY', 'Buyer', 'G4', 'indirect'],
  ['J-EHS', 'EHS officer', 'G5', 'indirect'], ['J-FM', 'Finance manager', 'G7', 'indirect'], ['J-ACC', 'Accountant', 'G4', 'indirect'], ['J-CAC', 'Cost accountant', 'G5', 'indirect'],
  ['J-HRM', 'HR manager', 'G7', 'indirect'], ['J-HRO', 'HR officer', 'G4', 'indirect'], ['J-NUR', 'Clinic nurse', 'G4', 'indirect'],
  ['J-SM', 'Sales manager', 'G7', 'indirect'], ['J-KAM', 'Key account manager', 'G5', 'indirect'], ['J-CSR', 'Customer service representative', 'G3', 'indirect'], ['J-MKT', 'Marketing specialist', 'G4', 'indirect'],
  ['J-CEO', 'Chief executive officer', 'G8', 'indirect'], ['J-CFO', 'Chief financial officer', 'G8', 'indirect'], ['J-COO', 'Chief operating officer', 'G8', 'indirect'],
].map(([code, title, grade, kind]) => ({ code, title, grade, kind }));
const JOB = Object.fromEntries(JOBS.map((j) => [j.code, j]));
export const ORG = [
  ['DCER', 'Demo Ceramics Co.', null, null, 'company'], ['MGT', 'Top management', 'CC-MGT', 'DCER', 'dept'], ['PRD', 'Production', null, 'DCER', 'dept'],
  ['L1', 'Tile line 1 (floor porcelain)', 'CC-L1', 'PRD', 'section'], ['L2', 'Tile line 2 (wall tiles and planks)', 'CC-L2', 'PRD', 'section'], ['BDY', 'Body preparation (mills, spray dryer)', 'CC-BDY', 'PRD', 'section'],
  ['REL', 'Relief pool', 'CC-REL', 'PRD', 'section'], ['PMG', 'Production management', 'CC-PMG', 'PRD', 'section'],
  ['WHL', 'Warehouse and logistics', 'CC-WHL', 'DCER', 'dept'], ['QA', 'Quality and laboratory', 'CC-QA', 'DCER', 'dept'], ['MNT', 'Maintenance', 'CC-MNT', 'DCER', 'dept'], ['ENG', 'Technical and design', 'CC-ENG', 'DCER', 'dept'],
  ['SCM', 'Supply chain and purchasing', 'CC-SCM', 'DCER', 'dept'], ['EHS', 'EHS', 'CC-EHS', 'DCER', 'dept'], ['FIN', 'Finance and accounting', 'CC-FIN', 'DCER', 'dept'], ['HRA', 'HR and administration', 'CC-HRA', 'DCER', 'dept'],
  ['SAL', 'Sales, marketing and customer service', 'CC-SAL', 'DCER', 'dept'],
].map(([code, name, cost_center, parent, kind]) => ({ code, name, cost_center, parent, kind }));
export const COST_CENTERS = ORG.filter((o) => o.cost_center).map((o) => ({ code: o.cost_center, name: o.name, org_unit: o.code }));
const UNIT_CC = Object.fromEntries(ORG.map((o) => [o.code, o.cost_center]));

const SPEC = [];
const S = (unit, job, n, teams = ['D'], extra = {}) => SPEC.push({ unit, job, n, teams, ...extra });
S('MGT', 'J-CEO', 1); S('MGT', 'J-CFO', 1); S('MGT', 'J-COO', 1);
S('PMG', 'J-PM', 1); S('PMG', 'J-SUP', 1, ['A', 'B'], { line: 'L1' }); S('PMG', 'J-SUP', 1, ['A', 'B'], { line: 'L2' });
for (const [unit, line] of [['L1', 'L1'], ['L2', 'L2']]) {
  for (const [station, crew] of Object.entries(CREW).filter(([s]) => s.startsWith(line + '-'))) {
    const op = station.slice(3);
    S(unit, { PR: 'J-PRS', DR: 'J-DRY', GL: 'J-GLZ', KL: 'J-KLN', SP: 'J-SRT' }[op], crew, ['A', 'B'], { line, op });
  }
  S(unit, 'J-LDR', 1, ['A', 'B'], { line, op: 'LEADER' }); S(unit, 'J-FLT', 2, ['A', 'B'], { line, op: 'HANDLER' });
}
S('BDY', 'J-MIL', 4, ['A', 'B'], { line: 'BODY', op: 'MILL' });
S('REL', 'J-REL', 3, ['A', 'B'], { line: 'POOL' });
S('WHL', 'J-WHS', 1); S('WHL', 'J-WHK', 2, ['A', 'B']); S('WHL', 'J-REC', 2, ['D']); S('WHL', 'J-FLT', 4, ['D']); S('WHL', 'J-SHIP', 3, ['D']);
S('QA', 'J-IQC', 2, ['D']); S('QA', 'J-OQC', 2, ['A', 'B']); S('QA', 'J-LAB', 2); S('QA', 'J-QE', 2); S('QA', 'J-QM', 1);
S('MNT', 'J-MTC', 4, ['A', 'B']); S('MNT', 'J-MEN', 2); S('MNT', 'J-MM', 1);
S('ENG', 'J-PE', 2); S('ENG', 'J-DSN', 2); S('ENG', 'J-EM', 1);
S('SCM', 'J-SCM', 1); S('SCM', 'J-PLN', 2); S('SCM', 'J-BUY', 2);
S('EHS', 'J-EHS', 2); S('FIN', 'J-FM', 1); S('FIN', 'J-ACC', 3); S('FIN', 'J-CAC', 1);
S('HRA', 'J-HRM', 1); S('HRA', 'J-HRO', 2); S('HRA', 'J-NUR', 1);
S('SAL', 'J-SM', 1); S('SAL', 'J-KAM', 2); S('SAL', 'J-CSR', 3); S('SAL', 'J-MKT', 1);

export const POSITIONS = [];
const posKey = new Map();
function positionFor(s, team) {
  const code = `POS-${s.unit}-${s.job.slice(2)}${s.op ? '-' + s.op : ''}${s.unit === 'PMG' && s.line ? '-' + s.line : ''}-${team}`;
  if (!posKey.has(code)) { const p = { code, unit: s.unit, job: s.job, team, line: s.line || null, op: s.op || null, headcount: 0, vacant: 0 }; posKey.set(code, p); POSITIONS.push(p); }
  return posKey.get(code);
}
const MALE = ['Ahmed', 'Mohamed', 'Mahmoud', 'Mostafa', 'Ali', 'Hassan', 'Hussein', 'Ibrahim', 'Khaled', 'Amr', 'Tarek', 'Sherif', 'Karim', 'Omar', 'Youssef', 'Adel', 'Sayed', 'Ramy', 'Waleed', 'Hany', 'Essam', 'Samir', 'Nabil', 'Magdy', 'Osama', 'Walid', 'Ashraf', 'Medhat', 'Fathy', 'Gamal', 'Reda', 'Emad', 'Yasser', 'Wael', 'Bassem', 'Hatem', 'Ayman', 'Salah', 'Ismail', 'Abdallah'];
const FEMALE = ['Fatma', 'Aya', 'Mona', 'Heba', 'Nour', 'Sara', 'Dina', 'Rania', 'Eman', 'Amira', 'Salma', 'Yasmin', 'Nada', 'Hala', 'Marwa', 'Shaimaa', 'Reham', 'Asmaa', 'Samar', 'Doaa', 'Noha', 'Hend', 'Rasha', 'Mai', 'Ghada'];
const FAMILY = ['El-Sayed', 'Hassan', 'Ibrahim', 'Mansour', 'Abdel-Aziz', 'Farouk', 'Saad', 'Nasser', 'Khalil', 'Zaki', 'Fahmy', 'Soliman', 'Ramadan', 'Metwally', 'Shehata', 'Gaber', 'Habib', 'Lotfy', 'Barakat', 'Kamel', 'Awad', 'Sabry', 'Morsi', 'Taha', 'Wahba', 'Othman', 'Desouky', 'Amer', 'Shaker', 'Radwan', 'El-Sherif', 'Hegazy', 'Moussa', 'Azab', 'Bakr', 'Yassin'];
const usedNames = new Set();
function makeName(key, female) {
  for (let i = 0; ; i++) {
    const first = (female ? FEMALE : MALE)[Math.floor(U('fn', key, i) * (female ? FEMALE : MALE).length)];
    const father = MALE[Math.floor(U('mn', key, i) * MALE.length)];
    const fam = FAMILY[Math.floor(U('ln', key, i) * FAMILY.length)];
    const n = `${first} ${father} ${fam}`;
    if (!usedNames.has(n)) { usedNames.add(n); return n; }
  }
}
const round50 = (x) => Math.round(x / 50) * 50;
function wageFor(code, grade) { const [lo, hi, mid] = GRADES[grade]; return Math.min(hi, Math.max(lo, round50(mid * (0.93 + U('w', code) * 0.16)))); }
export const EMPLOYEES = [];
let seq = 0;
function addEmp(o) {
  const code = `E${pad(++seq, 6)}`;
  const job = JOB[o.job], grade = o.grade || job.grade, gross = o.gross ?? wageFor(code, grade);
  const female = o.female ?? (U('g', code) < (job.kind === 'direct' ? 0.2 : 0.3) && !['J-FLT', 'J-MTC', 'J-KLN', 'J-CEO', 'J-COO'].includes(o.job));
  const e = { code, name_en: makeName(code, female), gender: female ? 'F' : 'M', unit: o.unit, cost_center: UNIT_CC[o.unit], position: o.position, job: o.job, grade, employment_type: 'regular',
    hire_date: o.hire_date, first_productive_date: o.first_productive_date || o.hire_date, exit_date: null, team: o.team, line: o.line || null, op: o.op || null, gross_monthly_egp: gross, basic_egp: round50(gross * SI.basic_share), status: 'active',
    agency: null, contract_end: null, source: o.source || null, req: o.req || null };
  e.insurable_egp = Math.min(SI.max, Math.max(SI.min, e.basic_egp));
  EMPLOYEES.push(e); return e;
}
function hireDateFor(code, job) {
  const senior = ['G6', 'G7', 'G8'].includes(JOB[job].grade);
  const from = senior ? Date.UTC(2019, 0, 1) : Date.UTC(2020, 5, 1), to = Date.UTC(2026, 3, 30);
  return new Date(from + U('hd', code) * (to - from)).toISOString().slice(0, 10);
}
for (const s of SPEC) for (const team of s.teams) for (let i = 0; i < s.n; i++) {
  const p = positionFor(s, team); p.headcount++;
  addEmp({ unit: s.unit, job: s.job, position: p.code, team, line: s.line, op: s.op, grade: s.grade, hire_date: hireDateFor(`E${pad(seq + 1, 6)}`, s.job) });
}
export const PERMANENT_COUNT = EMPLOYEES.length;

// qualifications at the start of the window
for (const e of EMPLOYEES) {
  const sk = [];
  const cert = (skill, level) => {
    const months = SKILLS.find((x) => x.code === skill).validity_months;
    let c = addDays('2026-06-30', -Math.floor(U('cert', e.code, skill) * (months * 30 - 150)));
    if (c < addDays(e.hire_date, 3)) c = addDays(e.hire_date, 3);
    sk.push({ skill, level, certified_on: c, expires_on: addDays(c, months * 30) });
  };
  const prod = ['L1', 'L2', 'BDY', 'REL'].includes(e.unit) || ['WHL', 'QA', 'MNT'].includes(e.unit);
  if (prod) cert('SAFE', 2);
  if (e.op && OPSKILL[e.op]) cert(OPSKILL[e.op], U('lvl', e.code) < 0.25 ? 3 : 2);
  if (e.op === 'LEADER') { cert('LEAD', 3); for (const k of ['PRESS', 'GLAZE', 'KILN']) cert(k, 3); }
  if (e.op === 'HANDLER' || e.job === 'J-FLT') cert('FORK', 2);
  if (e.job === 'J-LAB' || e.job === 'J-IQC' || e.job === 'J-OQC') cert('LAB', 2);
  if (e.unit === 'REL') for (const s of ['PRESS', 'DRYER', 'GLAZE', 'KILN', 'SORT']) cert(s, 2);
  e.skills = sk;
}

// ---------------------------------------------------------------- turnover: two sorter/packer leavers a month, replaced two weeks later, with a short induction
export const MOVEMENTS = [];
export const HIRING = { requisitions: [], candidates: [], training: [] };
{
  const pool = EMPLOYEES.filter((e) => e.job === 'J-SRT' && e.op === 'SP');
  const taken = new Set();
  let candNo = 100, reqNo = 0;
  for (const [exit, plannedHire] of [['2026-07-09', '2026-07-23'], ['2026-08-06', '2026-08-20'], ['2026-09-03', '2026-09-17']]) {
    const hire = nextWork(plannedHire), certified = addWork(hire, 1), productive = addWork(hire, 2);
    const req = `REQ-${pad(++reqNo, 4)}`;
    const leavers = [];
    for (let i = 0; leavers.length < 2; i++) { const e = pool[Math.floor(U('leaver', exit, i) * pool.length)]; if (!taken.has(e.code)) { taken.add(e.code); leavers.push(e); } }
    const cands = [];
    for (const l of leavers) {
      l.exit_date = exit; l.status = 'left';
      MOVEMENTS.push({ type: 'leaver', employee: l.code, date: exit, reason: 'resignation' });
      const rep = addEmp({ unit: l.unit, job: l.job, position: l.position, team: l.team, line: l.line, op: l.op, grade: 'G1', hire_date: hire, first_productive_date: productive, source: 'walk_in', req, gross: 7500 });
      rep.skills = [{ skill: 'SAFE', level: 2, certified_on: certified, expires_on: addDays(certified, 365) }, { skill: 'SORT', level: 2, certified_on: certified, expires_on: addDays(certified, 730) }];
      MOVEMENTS.push({ type: 'hire', employee: rep.code, date: hire, replaces: l.code, requisition: req, first_productive_date: rep.first_productive_date });
      cands.push({ code: `CAN-${pad(++candNo, 4)}`, requisition: req, source: 'walk_in', stage: 'hired', hired_as: rep.code, applied: addDays(hire, -12), screened: addDays(hire, -9), interviewed: addDays(hire, -6), offered: addDays(hire, -3), hired: hire });
    }
    HIRING.requisitions.push({ code: req, job: 'J-SRT', count: 2, reason: 'replacement', employment_type: 'regular', raised: addDays(exit, 1), approved: addDays(exit, 2), needed_by: hire, status: 'filled', work_center: 'L1/L2 sorting', approved_by: 'E000002' });
    HIRING.candidates.push(...cands);
    HIRING.training.push({ code: `TRN-${pad(HIRING.training.length + 1, 4)}`, course: 'Safety induction and sorting basics (2 days)', dates: [hire, certified], attendees: cands.map((c) => c.hired_as), result: 'pass' });
  }
}

// ---------------------------------------------------------------- attendance model (the engine and HR's payroll inputs evaluate the same functions)
export const ABSENT_BASE = 0.04;
const DOW_W = { 6: 1.3, 0: 1.1, 1: 0.95, 2: 0.9, 3: 0.9, 4: 0.95 };
const DOW_NORM = (1.3 + 1.1 + 0.95 + 0.9 + 0.9 + 0.95) / 6;
export const absentRate = (date) => ABSENT_BASE * (DOW_W[dow(date)] ?? 1) / DOW_NORM;
export const LEAVE = {};
for (const e of EMPLOYEES.filter((x) => x.status === 'active' && x.hire_date < '2026-03-01')) {
  if (U('leave', e.code) < 0.3) {
    let start = addDays('2026-07-05', Math.floor(U('ls', e.code) * 80)); while (!isWork(start)) start = addDays(start, 1);
    let end = start, n = 1; while (n < 6) { end = addDays(end, 1); if (isWork(end)) n++; }
    LEAVE[e.code] = [start, end]; e.leave_block = { from: start, to: end, working_days: 6 };
  }
}
export const onLeave = (e, d) => { const l = LEAVE[e.code]; return !!l && d >= l[0] && d <= l[1]; };
export const activeOn = (e, d) => d >= e.first_productive_date && (!e.exit_date || d <= e.exit_date);
export const absentOn = (e, d) => !onLeave(e, d) && U('abs', e.code, d) < absentRate(d);
export const unexcused = (e, d) => U('unx', e.code, d) < 0.3;
export const workedC = () => false;

// ---------------------------------------------------------------- overtime the plant plans (asked the day before by the officer, approved by the manager)
export const OT_PLAN = [
  { id: 'OT-01', who: 'Sorters and packers of both lines in the September peak', filter: (e) => e.op === 'SP' && ['A', 'B'].includes(e.team), from: '2026-09-01', to: '2026-09-30', hours_per_week: 6, days_per_week: 3, kind: 'day', reason: 'September demand above plan: sorting and packing backlog' },
  { id: 'OT-02', who: 'Warehouse and shipping, loading of the Red Sea Developments order', filter: (e) => e.unit === 'WHL' && ['J-SHIP', 'J-FLT', 'J-WHK'].includes(e.job), from: '2026-08-24', to: '2026-08-31', hours_per_week: 4, days_per_week: 2, kind: 'day', reason: 'Project order RSD-BLOCK-7: loading and dispatch' },
  { id: 'OT-03', who: 'Shipping and forklift staff on Fridays 4 and 11 September (rest-day work, substitute day + 100 %)', filter: (e) => e.unit === 'WHL' && ['J-SHIP', 'J-FLT'].includes(e.job), fridays: ['2026-09-04', '2026-09-11'], hours_each: 8, kind: 'rest_day', reason: 'Truck loading before the Saturday dispatch' },
  { id: 'OT-04', who: 'Kiln operators on both lines, firing-curve changes', filter: (e) => e.op === 'KL' && ['A', 'B'].includes(e.team), from: '2026-08-01', to: '2026-09-30', hours_per_week: 4, days_per_week: 2, kind: 'night', reason: 'Kiln hand-over and curve change at the end of the shift' },
  { id: 'OT-05', who: 'Maintenance technicians, kiln roller replacement', filter: (e) => e.unit === 'MNT' && e.job === 'J-MTC', from: '2026-07-15', to: '2026-07-31', hours_per_week: 6, days_per_week: 3, kind: 'day', reason: 'Roller replacement on the Line 2 kiln' },
];

// ---------------------------------------------------------------- the book
export function buildCeramicBook(opts = {}) {
  const from = opts.from ?? WINDOW.from, to = opts.to ?? WINDOW.to;
  const models = opts.models ?? MODELS;
  const validDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d + 'T00:00:00Z')) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
  if (!validDate(from) || !validDate(to) || from > to) throw new Error('Ceramic window needs valid ISO dates with from <= to');
  if (!Array.isArray(models) || !models.length || new Set(models).size !== models.length || models.some((m) => !MODELS.includes(m))) throw new Error('Ceramic models must be a nonempty, unique selection of known tile products');
  const keep = new Set(models);
  for (const m of models) for (const l of BOMS[m].lines) keep.add(l.component);
  const items = ITEMS.filter((i) => keep.has(i.code));
  const lines = new Set(models.map((m) => ROUTINGS[m].lines[0]));
  const suppliers = SUPPLIERS.filter((s) => items.some((i) => i.supplier === s.code));
  const events = [];
  const add = (date, kind, data) => { if (date >= from && date <= to) events.push({ date, kind, ...data }); };
  // a plan for each month, approved on its first working day, looking three months ahead
  for (const month of monthsOf(from, to)) {
    const first = dateList(month + '-01', month + '-10').find(isWork);
    const rows = [];
    for (let k = 0; k < 3; k++) {
      const mk = addMonths(month, k);
      for (const m of models) rows.push({ item: m, month: mk, qty: Math.round(MONTHLY_M2[m] * (SEASON[mk] ?? 1) / 10) * 10 });
    }
    add(first < from ? from : first, 'sop', { cycle: month, version: 1, code: `SOP-${month}`, rows });
  }
  const { orders, project } = salesOrders(from, to);
  for (const o of orders) if (keep.has(o.item)) add(o.date, 'sales_order', { customer: o.customer, channel: 'domestic', lines: [{ item: o.item, qty: o.qty, unit_price_egp: unitPrice(o.customer, o.item), requested: o.requested }] });
  const projectLines = project.lines.filter(([m]) => keep.has(m)).map(([m, q]) => ({ item: m, qty: q, unit_price_egp: unitPrice(project.customer, m), requested: project.requested }));
  if (projectLines.length) add(project.date, 'sales_order', { customer: project.customer, channel: 'domestic', reference: project.ref, lines: projectLines });
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  const days = dateList(from, to).map((d) => ({ date: d, work: isWork(d), holiday: HOLIDAYS[d] ?? null, fx_egp_per_usd: 50 }));
  return {
    meta: { seed: SEED, window: { from, to }, scale: 1, models, generator: 'complete-company/scenario/gen/ceramic.mjs', note: 'an invented company: every name, price and wage is sample data' },
    company: { code: COMPANY.code, name: COMPANY.legal_name, vat_rate: COMPANY.vat_rate, plan_fx: COMPANY.plan_fx },
    suppliers: suppliers.map((s) => ({ code: s.code, name: s.name, currency: s.currency, terms: s.payment_terms, lead_days: s.planned_lead_time_days })),
    customers: CUSTOMERS.map((c) => ({ code: c.code, name: c.name, currency: c.currency, terms_days: c.terms_days, credit_limit_egp: c.credit_limit_egp, pay_delay_mean: c.pay_delay_mean, export: false })),
    items, boms: Object.fromEntries(models.map((m) => [m, BOMS[m]])), routings: Object.fromEntries(models.map((m) => [m, ROUTINGS[m]])),
    plant: PLANT.filter((n) => n.type === 'plant' || n.type === 'area' || lines.has(n.code) || [...lines].some((l) => n.code.startsWith(l + '-'))),
    shifts: SHIFTS,
    calendar: { rest_weekday: 5, holidays: Object.entries(HOLIDAYS).filter(([d]) => d >= from && d <= to).map(([date, name]) => ({ date, name })) },
    capacity: { per_shift: Object.fromEntries(models.map((m) => [m, CAP_PER_SHIFT[m]])), shifts_on: Object.fromEntries([...lines].map((l) => [l, dateList(from, to).filter(isWork).map((d) => [d, ['A', 'B']])])) },
    packing: Object.fromEntries(models.map((m) => [m, { per_pallet: 60, per_truck: 1440, per_40hc: 1200 }])),   // cartons: a pallet holds 60, a truck 24 pallets (tiles ship by lot, see production.mode)
    fx: [],
    people: { org: ORG, jobs: JOBS, skills: SKILLS, positions: POSITIONS, employees: EMPLOYEES, station_requirements: STATION_REQUIREMENTS, agency_temps: 0, temp_plan: null,
      site: { code: 'SITE-SC', name: 'Sadat City plant' }, course: { code: 'SAFE-INDUCTION', name: 'Safety induction and station basics (2 days)', onboarding_kind: 'esd_training' }, calendar_name: 'Plant calendar (Friday rest, public holidays)' },
    production: { mode: 'batch', loss: LOSS, reasons: SCRAP_REASONS, cover: COVER, lot_prefix: { 'TL-6060-WHT': 'W60', 'TL-6060-GRY': 'G60', 'TL-3060-BGE': 'B30', 'TL-2090-OAK': 'O20' } },
    defects: [['GLAZE-SHADE', 'Glaze shade off standard', 'appearance', 'major'], ['LOT-BAD', 'Incoming lot below quality', 'incoming', 'major'], ['MOISTURE', 'Clay moisture out of range', 'incoming', 'minor']],
    policies: { planner: { release_days_ahead: 4 }, buyer: { review_days: 14 }, billing: { post_invoices_same_day: true }, hr: { horizon_days: 14, lead_days_to_hire: 5 } },
    events, days, checks: [],
    kpi_expected: { otif_domestic_key_accounts_pct: [0, 100], on_time_units_pct: [0, 100], fill_by_end_pct: [0, 100], oee_fa_pct: [0, 100] },
  };
}

if (process.argv[1]?.endsWith('ceramic.mjs')) {
  const book = buildCeramicBook();
  const orders = book.events.filter((e) => e.kind === 'sales_order');
  const m2 = orders.reduce((a, e) => a + e.lines.reduce((b, l) => b + l.qty, 0), 0);
  const payroll = EMPLOYEES.reduce((a, e) => a + e.gross_monthly_egp, 0);
  console.log(`ceramic book ${book.meta.window.from}..${book.meta.window.to}: ${book.items.length} items, ${orders.length} orders (${Math.round(m2)} m2), ${book.events.filter((e) => e.kind === 'sop').length} plans, ${book.people.employees.length} people, monthly gross payroll ${payroll} EGP`);
}
