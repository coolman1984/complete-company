// Master data: FX, company, items, BOMs, routings, plant, layout, parties, banks. Pure data + arithmetic.
import { addDays, dateList, dow, fnv1a32, isBank, prevBank, r2, r4, rint, U, OPENING, sum } from './lib.mjs';

export const PLAN_FX = 51.0;
export const LANDED = { freight_ins: 0.025, duty: 0.02, clearance: 0.005 };   // research §2.3, §3.5: +4.5 % of imported value
export const LANDED_FACTOR = 1 + LANDED.freight_ins + LANDED.duty + LANDED.clearance;
export const OEE_PLAN = { FA: 0.80, SMT: 0.66, THT: 0.70 };   // FA 0.80 = research §4.4 capacity basis
export const NET_SHIFT_SEC = 23400;   // 8 h span - 1 h rest - 30 min meeting/5S = 6.5 h

// ---------------------------------------------------------------- FX (USD/EGP, 5-bank average style, bank days only)
const FX_ANCHORS = [['2026-03-31', 50.10], ['2026-06-30', 50.45], ['2026-07-16', 50.66], ['2026-07-30', 50.80], ['2026-08-13', 50.88],
  ['2026-08-31', 50.97], ['2026-09-01', 50.99], ['2026-09-17', 51.16], ['2026-09-28', 51.34], ['2026-12-31', 51.60]];
function interp(x) {
  for (let i = 0; i + 1 < FX_ANCHORS.length; i++) {
    const [a, va] = FX_ANCHORS[i], [b, vb] = FX_ANCHORS[i + 1];
    if (x >= a && x <= b) { const t = (Date.parse(x) - Date.parse(a)) / Math.max(1, Date.parse(b) - Date.parse(a)); return va + (vb - va) * t; }
  }
  return FX_ANCHORS[FX_ANCHORS.length - 1][1];
}
export const FX = {};          // every calendar day -> mid rate (non-bank days carry the previous bank day)
export const FX_TABLE = [];    // published rows (bank days) for the window and 10 weeks before it
{
  let last = 50.1;
  for (const x of dateList('2026-03-31', '2026-12-31')) {
    if (isBank(x) || x === '2026-03-31') {
      const anchor = FX_ANCHORS.find(([a]) => a === x);
      let mid = anchor ? anchor[1] : interp(x) + 0.03 * Math.sin(Date.parse(x) / 86400000 * 1.7) + (U('fx', x) - 0.5) * 0.04;
      mid = r2(mid); last = mid;
      if (x >= '2026-04-20' && x <= '2026-09-28') FX_TABLE.push({ date: x, mid, buy: r2(mid - 0.05), sell: r2(mid + 0.05) });
    }
    FX[x] = last;
  }
}
export const fx = (d) => FX[d];

// ---------------------------------------------------------------- company
export const COMPANY = {
  code: 'NVE', legal_name: 'Nile Vision Electronics S.A.E.', invented: true, brand: 'NileVision (invented brand)',
  legal_form: 'Joint stock company (S.A.E.)', address: 'Industrial Zone A3, Plot 14, 10th of Ramadan City, Sharqia Governorate, Egypt',
  tax_registration_no: '512-874-903', commercial_register: 'Sharqia CR 88412', vat_registered: true, eta_einvoice: true,
  functional_currency: 'EGP', foreign_currencies: ['USD'], fiscal_year: 'calendar (Jan-Dec)', plan_fx_egp_per_usd: PLAN_FX,
  fx_sensitivity: [48, 55], corporate_tax_rate: 0.225, vat_rate: 0.14, annual_plan_sets: 280000, annual_working_days: 290,
  source: 'research §10.1 scaled from 800,000 to 280,000 sets/yr (35 %) [E]',
};

// ---------------------------------------------------------------- products
export const MODELS = ['NV-43U', 'NV-50U', 'NV-55U', 'NV-55Q', 'NV-65U', 'NV-65Q'];
export const SIZE = { 'NV-43U': 43, 'NV-50U': 50, 'NV-55U': 55, 'NV-55Q': 55, 'NV-65U': 65, 'NV-65Q': 65 };
export const QLED = new Set(['NV-55Q', 'NV-65Q']);
export const LINE_OF = { 'NV-43U': 'FA-1', 'NV-50U': 'FA-1', 'NV-55U': 'FA-1', 'NV-55Q': 'FA-2', 'NV-65U': 'FA-2', 'NV-65Q': 'FA-2' };
export const RETAIL = { 'NV-43U': 12499, 'NV-50U': 15999, 'NV-55U': 18999, 'NV-55Q': 21499, 'NV-65U': 24999, 'NV-65Q': 27999 };
export const SELL_IN = Object.fromEntries(MODELS.map((m) => [m, rint(RETAIL[m] / 1.14 * 0.85)]));   // research §10.2
export const EXPORT_CIF = { 'NV-43U': 176, 'NV-50U': 226, 'NV-55U': 268, 'NV-55Q': 305, 'NV-65U': 356, 'NV-65Q': 398 };   // USD per set, CIF Jeddah / Umm Qasr
export const CYCLE_FA = { 'NV-43U': 44, 'NV-50U': 47, 'NV-55U': 50, 'NV-55Q': 56, 'NV-65U': 62, 'NV-65Q': 66 };            // bottleneck (open-cell mounting) seconds per set
export const ANNUAL_PLAN = { 'NV-43U': 70000, 'NV-50U': 36000, 'NV-55U': 58000, 'NV-55Q': 34000, 'NV-65U': 56000, 'NV-65Q': 26000 };   // = 280,000
export const CARTON = { 43: [1050, 145, 650], 50: [1220, 150, 750], 55: [1350, 160, 830], 65: [1570, 180, 960] };   // research §3.3
export const GROSS_KG = { 43: 10.5, 50: 14.2, 55: 17.8, 65: 26.5 };
export const PALLET_QTY = { 43: 16, 50: 14, 55: 12, 65: 8 };
export const TRUCK_QTY = { 43: 400, 50: 330, 55: 288, 65: 180 };
export const CONV_USD = { 'NV-43U': 7, 'NV-50U': 8, 'NV-55U': 9, 'NV-55Q': 9.5, 'NV-65U': 11, 'NV-65Q': 11.5 };   // research §10.2 (std conversion, USD)
export const CONV_BOARD_EGP = { 'MB-U': 26, 'MB-Q': 26, 'PBS-S': 8, 'PBS-L': 8, 'PB-S': 14, 'PB-L': 16 };
export const capPerShift = (cycle, oee = OEE_PLAN.FA) => Math.floor(NET_SHIFT_SEC * oee / cycle);
export const CAP_FA = Object.fromEntries(MODELS.map((m) => [m, capPerShift(CYCLE_FA[m])]));
// sets per 40HC: 83 % volumetric fill of the 76.3 m3 internal volume (research §3.3 quotes 85 % [E]; loose-loaded, mixed orientation with dunnage)
export const CONTAINER_M3 = 12.03 * 2.35 * 2.70;
export const PER_40HC = Object.fromEntries(Object.entries(CARTON).map(([s, [w, d, h]]) => [s, Math.floor(0.83 * CONTAINER_M3 / (w * d * h / 1e9))]));

// ---------------------------------------------------------------- suppliers (invented)
export const SUPPLIERS = [
  ['S-HAO', 'Hefei Aurora Optoelectronics Co., Ltd.', 'CN', 'Hefei', 'USD', 'open cells 43/50 (primary)', 'FOB', 'Shanghai', 'TT30_70', 70],
  ['S-SSD', 'Shenzhen Starlight Display Technology Co., Ltd.', 'CN', 'Shenzhen', 'USD', 'open cells 55/65 (primary)', 'FOB', 'Shenzhen (Yantian)', 'TT30_70', 70],
  ['S-CHP', 'Chongqing Horizon Panel Co., Ltd.', 'CN', 'Chongqing', 'USD', 'open cells 43/55 (second source)', 'FOB', 'Shanghai', 'LC_SIGHT', 75],
  ['S-GBW', 'Guangzhou Brightway Backlight Co., Ltd.', 'CN', 'Guangzhou', 'USD', 'LED bars, diffuser plates, reflectors, optical films, middle frames', 'FOB', 'Guangzhou (Nansha)', 'TT30_70', 50],
  ['S-SQD', 'Suzhou Q-Dot Materials Co., Ltd.', 'CN', 'Suzhou', 'USD', 'quantum-dot films', 'FOB', 'Shanghai', 'TT30_70', 55],
  ['S-TSD', 'Taipei Silicon Distribution Ltd.', 'TW', 'Taipei', 'USD', 'SoC, DDR4, eMMC, Wi-Fi/BT (franchised distributor; memory on allocation 2026)', 'FCA', 'Taipei (air)', 'TT30_70', 90],
  ['S-DPC', 'Dongguan PCB & Components Co., Ltd.', 'CN', 'Dongguan', 'USD', 'bare PCBs, passives, tuners, connectors, THT kits, power ICs', 'FOB', 'Shenzhen (Yantian)', 'TT30_70', 45],
  ['S-SSR', 'Shenzhen SoundRemote Electronics Co., Ltd.', 'CN', 'Shenzhen', 'USD', 'speakers, remotes, IR/key boards, harness kits', 'FOB', 'Shenzhen (Yantian)', 'TT30_70', 45],
  ['S-RCI', 'Ramadan Carton Industries', 'EG', '10th of Ramadan', 'EGP', '5-ply printed cartons', 'EXW', null, 'NET45', 5],
  ['S-SFE', 'Sadat Foam & EPS Co.', 'EG', 'Sadat City', 'EGP', 'EPS cushions', 'DAP', null, 'NET30', 5],
  ['S-DPI', 'Delta Plast Injection', 'EG', '10th of Ramadan', 'EGP', 'back covers and stands (molded, NVE-owned molds)', 'DAP', null, 'NET60', 7],
  ['S-OBF', 'Obour Fasteners', 'EG', 'El Obour', 'EGP', 'screws', 'DAP', null, 'NET30', 10],
  ['S-NMS', 'Nile Metal Stamping', 'EG', '10th of Ramadan', 'EGP', 'galvanized-steel chassis', 'DAP', null, 'NET45', 14],
  ['S-CCW', 'Cairo Cable Works', 'EG', 'Cairo', 'EGP', 'power cords', 'DAP', null, 'NET45', 10],
  ['S-SPP', 'Sharqia Print & Pack', 'EG', 'Zagazig', 'EGP', 'accessory kits (manual, warranty card, labels, bags)', 'DAP', null, 'NET30', 5],
  ['S-CSS', 'Cairo SMT Supplies', 'EG', 'Cairo', 'EGP', 'solder paste', 'DAP', null, 'NET30', 7],
].map(([code, name, country, city, currency, category, incoterm, port, payment, lead]) =>
  ({ code, name, invented: true, country, city, currency, category, incoterm, port, payment_terms: payment, planned_lead_time_days: lead, roles: ['supplier'] }));
export const SERVICE_VENDORS = [
  ['S-SFF', 'Sokhna Freight Forwarding', 'USD', 'ocean freight (FOB China -> Ain Sokhna) and export freight', 'NET15'],
  ['S-SBA', 'SkyBridge Air Cargo', 'USD', 'air freight (expedite)', 'NET15'],
  ['S-SCB', 'Suez Customs Brokerage', 'EGP', 'customs clearance, port handling, trucking Sokhna to plant', 'NET15'],
  ['S-SMS', 'Sharqia Manpower Services', 'EGP', 'temporary staffing agency', 'NET15'],
  ['S-DTR', 'Delta Trucking', 'EGP', 'domestic outbound trucking', 'NET30'],
  ['S-GML', 'Global Media Licensing Pool', 'USD', 'OS / codec / HDMI / Dolby royalties (per unit, quarterly)', 'NET45'],
  ['S-SPD', 'Sharqia Power Distribution', 'EGP', 'industrial electricity', 'NET10'],
  ['S-UTL', 'Ramadan Staff Transport & Catering', 'EGP', 'staff buses and subsidised meals', 'NET30'],
  ['S-GSC', 'Guardian Security & Cleaning', 'EGP', 'security and cleaning', 'NET30'],
  ['S-HMI', 'Horus Medical Insurance', 'EGP', 'private medical insurance', 'NET30'],
  ['S-DIS', 'Delta Industrial Services', 'EGP', 'maintenance services and spares', 'NET30'],
].map(([code, name, currency, category, payment]) => ({ code, name, invented: true, currency, category, payment_terms: payment, roles: ['supplier', 'service'] }));

// ---------------------------------------------------------------- items
export const ITEMS = [];
export const IDX = {};
function item(code, name, type, uom, procurement, o = {}) {
  const it = { code, name_en: name, type, uom, procurement, supplier: null, purchase_currency: null, purchase_price: null, lead_time_days: 0,
    lot_rule: 'lot_for_lot', lot_size: 1, moq: 0, safety_days: 0, tracking: 'none', warehouse: 'WH-RM', mrp_scrap_pct: 0, ship_kg: 0, ...o };
  ITEMS.push(it); IDX[code] = it; return it;
}
const FIX = (n) => ({ lot_rule: 'multiple', lot_size: n });
const OCB = { 43: 40, 50: 34, 55: 30, 65: 22 };
const OC_PER_40HC = { 43: 1920, 50: 1632, 55: 1320, 65: 880 };
const OC_KG = { 43: 4.1, 50: 5.6, 55: 7.2, 65: 10.9 };
export const OC_STD_USD = { 43: 66.0, 50: 100.5, 55: 127.0, 65: 177.5 };   // open cell + T-CON (research §2.2: OC 63/97/123/173; §2.3: T-CON 3/3.5/4/4.5)
for (const [code, s, sup, p, lt] of [['OC-43-HAO', 43, 'S-HAO', 66.0, 70], ['OC-43-CHP', 43, 'S-CHP', 65.0, 75], ['OC-50-HAO', 50, 'S-HAO', 100.5, 70],
  ['OC-55-SSD', 55, 'S-SSD', 127.0, 70], ['OC-55-CHP', 55, 'S-CHP', 125.5, 75], ['OC-65-SSD', 65, 'S-SSD', 177.5, 70]]) {
  item(code, `Open cell ${s}" UHD with T-CON (${sup})`, 'raw', 'EA', 'buy', { supplier: sup, purchase_currency: 'USD', purchase_price: p, lead_time_days: lt,
    ...FIX(OCB[s]), moq: OCB[s], safety_days: 7, tracking: 'serial', mrp_scrap_pct: 0.3, ship_kg: OC_KG[s], size: s, alt_group: `OC${s}`, per_40hc: OC_PER_40HC[s],
    std_basis_usd: OC_STD_USD[s], expedite_lead_time_days: 12,
    source: 'price = open cell [S8][S9] + T-CON (research §2.3) [E]; planned delivery time 70 d = 35 production + 4 inland + 22 sea + 6 clearance + 1 truck + 2 GR [S13][S15]' });
}
const BLU = { 43: [6, 0.9, 2.6, 0.8, 1.7, 1.7, 194], 50: [8, 0.95, 3.2, 0.95, 2.05, 1.9, 219], 55: [8, 1.1, 3.8, 1.1, 2.5, 2.4, 275], 65: [10, 1.2, 5.2, 1.4, 3.3, 3.1, 357] };
for (const [sz, [nled, pled, pdif, pref, popt, pmfr, pchs]] of Object.entries(BLU)) {
  const s = Number(sz);
  item(`LED-${s}`, `LED bar ${s}" direct-lit`, 'raw', 'EA', 'buy', { supplier: 'S-GBW', purchase_currency: 'USD', purchase_price: pled, lead_time_days: 50, ...FIX(200), moq: 200, safety_days: 10, tracking: 'lot', mrp_scrap_pct: 0.5, ship_kg: 0.08 });
  item(`DIF-${s}`, `Diffuser plate ${s}" PS 1.5 mm`, 'raw', 'EA', 'buy', { supplier: 'S-GBW', purchase_currency: 'USD', purchase_price: pdif, lead_time_days: 50, ...FIX(50), moq: 50, safety_days: 10, mrp_scrap_pct: 0.5, ship_kg: 1.1 * s / 55 });
  item(`REF-${s}`, `Reflector sheet ${s}"`, 'raw', 'EA', 'buy', { supplier: 'S-GBW', purchase_currency: 'USD', purchase_price: pref, lead_time_days: 50, ...FIX(200), moq: 200, safety_days: 10, mrp_scrap_pct: 0.5, ship_kg: 0.15 });
  item(`OPT-${s}`, `Optical film set ${s}" (diffuser sheet + prism)`, 'raw', 'SET', 'buy', { supplier: 'S-GBW', purchase_currency: 'USD', purchase_price: popt, lead_time_days: 50, ...FIX(200), moq: 200, safety_days: 10, tracking: 'lot', mrp_scrap_pct: 0.5, ship_kg: 0.2 });
  item(`MFR-${s}`, `Middle frame set ${s}"`, 'raw', 'SET', 'buy', { supplier: 'S-GBW', purchase_currency: 'USD', purchase_price: pmfr, lead_time_days: 50, ...FIX(100), moq: 100, safety_days: 10, mrp_scrap_pct: 0.3, ship_kg: 0.6 });
  item(`CHS-${s}`, `Bottom chassis ${s}" galvanized steel 0.7 mm`, 'raw', 'EA', 'buy', { supplier: 'S-NMS', purchase_currency: 'EGP', purchase_price: pchs, lead_time_days: 14, moq: 300, safety_days: 5, mrp_scrap_pct: 0.3 });
}
item('QDF-55', 'Quantum-dot film 55"', 'raw', 'EA', 'buy', { supplier: 'S-SQD', purchase_currency: 'USD', purchase_price: 15.0, lead_time_days: 55, ...FIX(100), moq: 100, safety_days: 14, tracking: 'lot', mrp_scrap_pct: 0.5, ship_kg: 0.12 });
item('QDF-65', 'Quantum-dot film 65"', 'raw', 'EA', 'buy', { supplier: 'S-SQD', purchase_currency: 'USD', purchase_price: 21.0, lead_time_days: 55, ...FIX(100), moq: 100, safety_days: 14, tracking: 'lot', mrp_scrap_pct: 0.5, ship_kg: 0.16 });
const TSD = (code, name, price, extra = {}) => item(code, name, 'raw', 'EA', 'buy', { supplier: 'S-TSD', purchase_currency: 'USD', purchase_price: price, lead_time_days: 90, ...FIX(1000), moq: 1000, safety_days: 30, tracking: 'lot', mrp_scrap_pct: 0.1, ship_kg: 0.002, ...extra });
TSD('SOC-U', 'SoC UHD smart-TV (quad-core, AV1)', 9.5);
TSD('SOC-Q', 'SoC QLED smart-TV (quad-core, MEMC, AV1)', 14.0);
TSD('DDR-2G', 'DDR4 2 GB (2026 allocation)', 5.8);
TSD('EMMC-16G', 'eMMC 16 GB', 3.9);
TSD('WIFI-BT', 'Wi-Fi 5 / Bluetooth 5.0 module', 2.6);
const DPC = (code, name, price, mult, lt = 45, extra = {}) => item(code, name, 'raw', extra.uom || 'EA', 'buy', { supplier: 'S-DPC', purchase_currency: 'USD', purchase_price: price, lead_time_days: lt, ...FIX(mult), moq: mult, safety_days: 14, tracking: 'lot', mrp_scrap_pct: 0.2, ...extra });
DPC('PCB-MB', 'Bare PCB main board 4-layer (per board, 2-up panel)', 2.2, 500, 45, { ship_kg: 0.06 });
DPC('TUN-T2S2', 'Tuner DVB-T2/S2', 1.9, 500, 45, { mrp_scrap_pct: 0.1, ship_kg: 0.02 });
DPC('CONN-MB', 'Connector set main board (HDMI x3, USB x2, LAN, AV)', 1.2, 1000, 45, { uom: 'SET', tracking: 'none', ship_kg: 0.03 });
DPC('PAS-MB', 'Passive components main board (mixed reels, per placement)', 0.00125, 100000, 45, { mrp_scrap_pct: 0.5 });
DPC('PCB-PB-S', 'Bare PCB power board 120 W (43/50")', 0.9, 1000, 45, { ship_kg: 0.05 });
DPC('PCB-PB-L', 'Bare PCB power board 180 W (55/65")', 1.1, 1000, 45, { ship_kg: 0.06 });
DPC('PAS-PB', 'Passive components power board (per placement)', 0.0015, 100000, 45, { mrp_scrap_pct: 0.5 });
DPC('PWR-IC-S', 'PWM / LED-driver IC set 120 W', 1.1, 1000, 45, { uom: 'SET', mrp_scrap_pct: 0.1 });
DPC('PWR-IC-L', 'PWM / LED-driver IC set 180 W', 1.4, 1000, 45, { uom: 'SET', mrp_scrap_pct: 0.1 });
DPC('THT-KIT-S', 'THT kit 120 W (transformer, e-caps, bridge, inlet)', 5.2, 500, 45, { uom: 'KIT', ship_kg: 0.18 });
DPC('THT-KIT-L', 'THT kit 180 W (transformer, e-caps, bridge, inlet)', 7.6, 500, 45, { uom: 'KIT', ship_kg: 0.25 });
item('SLD-PASTE', 'Solder paste SAC305 (per gram, jar 500 g)', 'raw', 'G', 'buy', { supplier: 'S-CSS', purchase_currency: 'EGP', purchase_price: 3.1, lead_time_days: 7, ...FIX(5000), moq: 5000, safety_days: 10, tracking: 'lot', mrp_scrap_pct: 5 });
const SSR = (code, name, price, mult, extra = {}) => item(code, name, 'raw', extra.uom || 'EA', 'buy', { supplier: 'S-SSR', purchase_currency: 'USD', purchase_price: price, lead_time_days: 45, ...FIX(mult), moq: mult, safety_days: 14, mrp_scrap_pct: 0.2, ...extra });
SSR('SPK-10W', 'Speaker 10 W 8 ohm', 1.2, 1000, { tracking: 'lot', ship_kg: 0.25 });
SSR('RC-NV', 'Remote control with 2 x AAA batteries', 1.0, 500, { uom: 'SET', tracking: 'lot', ship_kg: 0.12 });
SSR('IR-KEY', 'IR receiver / key board', 0.8, 1000, { ship_kg: 0.03 });
SSR('HAR-KIT', 'Harness / FFC kit', 1.0, 500, { uom: 'KIT', mrp_scrap_pct: 0.3, ship_kg: 0.1 });
item('CORD-EU', 'Power cord Europlug 1.5 m', 'raw', 'EA', 'buy', { supplier: 'S-CCW', purchase_currency: 'EGP', purchase_price: 31, lead_time_days: 10, ...FIX(1000), moq: 1000, safety_days: 5, mrp_scrap_pct: 0.2 });
const BC = { 43: 270, 50: 330, 55: 398, 65: 536 }, CTN = { 43: 163, 50: 194, 55: 224, 65: 316 }, EPS = { 43: 82, 50: 97, 55: 112, 65: 163 };
for (const s of [43, 50, 55, 65]) {
  item(`BC-${s}`, `Back cover ${s}" HIPS black (molded by Delta Plast)`, 'raw', 'EA', 'buy', { supplier: 'S-DPI', purchase_currency: 'EGP', purchase_price: BC[s], lead_time_days: 7, moq: 200, safety_days: 4, tracking: 'lot', mrp_scrap_pct: 0.3 });
  item(`CTN-${s}`, `Carton 5-ply printed ${s}"`, 'packaging', 'EA', 'buy', { supplier: 'S-RCI', purchase_currency: 'EGP', purchase_price: CTN[s], lead_time_days: 5, moq: 500, safety_days: 4, mrp_scrap_pct: 0.5 });
  item(`EPS-${s}`, `EPS cushion set ${s}" (4 pcs)`, 'packaging', 'SET', 'buy', { supplier: 'S-SFE', purchase_currency: 'EGP', purchase_price: EPS[s], lead_time_days: 5, moq: 500, safety_days: 4, mrp_scrap_pct: 0.5 });
}
item('STD-S', 'Stand feet pair 43/50"', 'raw', 'SET', 'buy', { supplier: 'S-DPI', purchase_currency: 'EGP', purchase_price: 110, lead_time_days: 7, moq: 500, safety_days: 4, mrp_scrap_pct: 0.2 });
item('STD-M', 'Stand feet pair 55"', 'raw', 'SET', 'buy', { supplier: 'S-DPI', purchase_currency: 'EGP', purchase_price: 130, lead_time_days: 7, moq: 500, safety_days: 4, mrp_scrap_pct: 0.2 });
item('STD-L', 'Stand feet pair 65"', 'raw', 'SET', 'buy', { supplier: 'S-DPI', purchase_currency: 'EGP', purchase_price: 175, lead_time_days: 7, moq: 300, safety_days: 4, mrp_scrap_pct: 0.2 });
item('SCR-M3', 'Screw M3x8 (back cover, boards)', 'raw', 'EA', 'buy', { supplier: 'S-OBF', purchase_currency: 'EGP', purchase_price: 0.35, lead_time_days: 10, ...FIX(50000), moq: 50000, safety_days: 10, mrp_scrap_pct: 1.5 });
item('SCR-M4', 'Screw M4x14 (stand, accessory bag)', 'raw', 'EA', 'buy', { supplier: 'S-OBF', purchase_currency: 'EGP', purchase_price: 0.6, lead_time_days: 10, ...FIX(10000), moq: 10000, safety_days: 10, mrp_scrap_pct: 1.5 });
item('PKG-KIT', 'Accessory kit: manual, warranty card, labels, PE bag, accessory bag', 'packaging', 'KIT', 'buy', { supplier: 'S-SPP', purchase_currency: 'EGP', purchase_price: 71, lead_time_days: 5, ...FIX(1000), moq: 1000, safety_days: 4, mrp_scrap_pct: 0.5 });
item('LIC-U', 'Software licence bundle UHD (OS, codecs, HDMI, Dolby) - royalty per unit', 'service', 'EA', 'buy', { supplier: 'S-GML', purchase_currency: 'USD', purchase_price: 5.5, warehouse: null, nonstock: true, note: 'non-stock: royalty accrued per set built, invoiced quarterly' });
item('LIC-Q', 'Software licence bundle QLED - royalty per unit', 'service', 'EA', 'buy', { supplier: 'S-GML', purchase_currency: 'USD', purchase_price: 6.5, warehouse: null, nonstock: true, note: 'non-stock royalty' });
// semi-finished (made in-house)
const SFG = (code, name, line, sd) => item(code, name, 'semi', 'EA', 'make', { warehouse: 'WH-SF', tracking: 'serial', lead_time_days: 1, safety_days: sd, line });
SFG('MB-U', 'Main board PBA UHD (SMT + AOI + ICT + FCT)', 'SMT-1', 1);
SFG('MB-Q', 'Main board PBA QLED (SMT + AOI + ICT + FCT)', 'SMT-1', 1);
SFG('PBS-S', 'Power board SMT side 120 W (semi-finished)', 'SMT-1', 1);
SFG('PBS-L', 'Power board SMT side 180 W (semi-finished)', 'SMT-1', 1);
SFG('PB-S', 'Power board PBA 120 W (PSU + LED driver)', 'THT-1', 1);
SFG('PB-L', 'Power board PBA 180 W (PSU + LED driver)', 'THT-1', 1);
for (const m of MODELS) {
  const s = SIZE[m];
  item(m, `NileVision ${s}" ${QLED.has(m) ? 'QLED' : 'UHD'} smart TV ${m}`, 'finished', 'EA', 'make', { warehouse: 'WH-FG', tracking: 'serial', lead_time_days: 1, safety_days: 10, line: LINE_OF[m],
    size: s, retail_egp_incl_vat: RETAIL[m], sell_in_egp: SELL_IN[m], export_cif_usd: EXPORT_CIF[m], ideal_cycle_s: CYCLE_FA[m], capacity_per_shift: CAP_FA[m],
    annual_plan: ANNUAL_PLAN[m], carton_mm: CARTON[s], gross_kg: GROSS_KG[s] + (QLED.has(m) ? 0.3 : 0), sets_per_pallet: PALLET_QTY[s], sets_per_40hc: PER_40HC[s],
    sets_per_truck: TRUCK_QTY[s], ean: `622${String(fnv1a32(m) % 1e9).padStart(9, '0')}0`, warranty_months: 24,
    source: 'list prices research §10.2 [E] anchored on [S12]; sell-in = retail / 1.14 x 0.85' });
}

// ---------------------------------------------------------------- BOMs (multi-level) and routings
export const BOMS = {};
function bom(parent, lines, note = '') {
  BOMS[parent] = { item: parent, revision: 1, status: 'approved', approved_at: '2026-05-20', base_qty: 1, note, lines: lines.map(([component, qty_per, op, scan]) => ({ component, qty_per, op, scan })) };
}
bom('MB-U', [['PCB-MB', 1, 'LDR', 'lot'], ['SLD-PASTE', 4, 'SPP', 'lot'], ['PAS-MB', 644, 'MT1', 'lot'], ['SOC-U', 1, 'MT2', 'lot'], ['DDR-2G', 1, 'MT2', 'lot'], ['EMMC-16G', 1, 'MT2', 'lot'], ['WIFI-BT', 1, 'MT2', 'lot'], ['TUN-T2S2', 1, 'MT2', 'lot'], ['CONN-MB', 1, 'MT2', 'none']], '640 placements + 4 lumped extra per board [E]');
bom('MB-Q', [['PCB-MB', 1, 'LDR', 'lot'], ['SLD-PASTE', 4, 'SPP', 'lot'], ['PAS-MB', 644, 'MT1', 'lot'], ['SOC-Q', 1, 'MT2', 'lot'], ['DDR-2G', 1, 'MT2', 'lot'], ['EMMC-16G', 1, 'MT2', 'lot'], ['WIFI-BT', 1, 'MT2', 'lot'], ['TUN-T2S2', 1, 'MT2', 'lot'], ['CONN-MB', 1, 'MT2', 'none']]);
bom('PBS-S', [['PCB-PB-S', 1, 'LDR', 'lot'], ['SLD-PASTE', 3, 'SPP', 'lot'], ['PAS-PB', 180, 'MT1', 'lot'], ['PWR-IC-S', 1, 'MT1', 'lot']]);
bom('PBS-L', [['PCB-PB-L', 1, 'LDR', 'lot'], ['SLD-PASTE', 3, 'SPP', 'lot'], ['PAS-PB', 180, 'MT1', 'lot'], ['PWR-IC-L', 1, 'MT1', 'lot']]);
bom('PB-S', [['PBS-S', 1, 'INS', 'serial'], ['THT-KIT-S', 1, 'INS', 'lot']]);
bom('PB-L', [['PBS-L', 1, 'INS', 'serial'], ['THT-KIT-L', 1, 'INS', 'lot']]);
export const OC_PRIMARY = { 43: 'OC-43-HAO', 50: 'OC-50-HAO', 55: 'OC-55-SSD', 65: 'OC-65-SSD' };
export const OC_MEMBERS = { 43: ['OC-43-HAO', 'OC-43-CHP'], 50: ['OC-50-HAO'], 55: ['OC-55-SSD', 'OC-55-CHP'], 65: ['OC-65-SSD'] };
const LED_N = { 43: 6, 50: 8, 55: 8, 65: 10 };
for (const m of MODELS) {
  const s = SIZE[m], q = QLED.has(m);
  const lines = [[`CHS-${s}`, 1, 'CHS', 'none'], [`LED-${s}`, LED_N[s], 'LED', 'lot'], [`REF-${s}`, 1, 'OPT', 'none'], [`DIF-${s}`, 1, 'OPT', 'none'], [`OPT-${s}`, 1, 'OPT', 'lot']];
  if (q) lines.push([`QDF-${s}`, 1, 'OPT', 'lot']);
  lines.push([`MFR-${s}`, 1, 'OPT', 'none'], [OC_PRIMARY[s], 1, 'OCM', 'serial'], [q ? 'MB-Q' : 'MB-U', 1, 'BRD', 'serial'], [s <= 50 ? 'PB-S' : 'PB-L', 1, 'BRD', 'serial'],
    ['IR-KEY', 1, 'BRD', 'none'], ['SPK-10W', 2, 'BRD', 'lot'], ['HAR-KIT', 1, 'BRD', 'none'], [`BC-${s}`, 1, 'BCV', 'lot'], ['SCR-M3', 26, 'BCV', 'none'],
    [q ? 'LIC-Q' : 'LIC-U', 1, 'SWD', 'none'], ['RC-NV', 1, 'ACC', 'lot'], [s <= 50 ? 'STD-S' : s === 55 ? 'STD-M' : 'STD-L', 1, 'ACC', 'none'], ['SCR-M4', 4, 'ACC', 'none'],
    ['CORD-EU', 1, 'ACC', 'none'], [`CTN-${s}`, 1, 'PKG', 'none'], [`EPS-${s}`, 1, 'PKG', 'none'], ['PKG-KIT', 1, 'PKG', 'none']);
  bom(m, lines, 'the display module (backlight + open cell) is built on the line (phantom, not stocked); T-CON comes with the open cell');
  BOMS[m].alternates = [{ component: OC_PRIMARY[s], group: `OC${s}`, members: OC_MEMBERS[s], rule: 'same standard cost; NV-55U may consume OC-55-CHP lots (second source)' }];
}
export const BOM_LINES = (p) => BOMS[p].lines;

// ---------------------------------------------------------------- standard cost roll-up (EGP at plan FX 51, landed adders on USD parts)
export const STD = {};
export const STD_BREAK = {};
for (const it of ITEMS) if (it.procurement === 'buy') {
  const usd = it.purchase_currency === 'USD';
  STD[it.code] = usd ? (it.std_basis_usd ?? it.purchase_price) * (it.nonstock ? 1 : LANDED_FACTOR) * PLAN_FX : it.purchase_price;
}
for (const p of ['MB-U', 'MB-Q', 'PBS-S', 'PBS-L', 'PB-S', 'PB-L', ...MODELS]) {
  const mat = sum(BOMS[p].lines, (l) => STD[l.component] * l.qty_per);
  const conv = MODELS.includes(p) ? CONV_USD[p] * PLAN_FX : CONV_BOARD_EGP[p];
  STD[p] = mat + conv; STD_BREAK[p] = { material_egp: r2(mat), conversion_egp: r2(conv), total_egp: r2(mat + conv) };
}
export function materialUsd(p) {   // FOB / ex-works material cost of one unit in USD (rolled through sub-assemblies), for comparison with research §10.2
  let t = 0;
  for (const l of BOMS[p].lines) {
    const c = IDX[l.component];
    t += c.procurement === 'make' ? materialUsd(c.code) * l.qty_per : (c.purchase_currency === 'USD' ? (c.std_basis_usd ?? c.purchase_price) : c.purchase_price / PLAN_FX) * l.qty_per;
  }
  return t;
}
export const RESEARCH_MAT = { 'NV-43U': 141.0, 'NV-50U': 184.5, 'NV-55U': 222.0, 'NV-55Q': 240.5, 'NV-65U': 291.5, 'NV-65Q': 314.0 };
export const RESEARCH_STD = { 'NV-43U': 154.3, 'NV-50U': 200.8, 'NV-55U': 241.0, 'NV-55Q': 260.8, 'NV-65U': 315.6, 'NV-65Q': 339.6 };
for (const it of ITEMS) {
  it.std_cost_egp = it.code === 'PAS-MB' || it.code === 'PAS-PB' ? r4(STD[it.code]) : r2(STD[it.code]);
  if (STD_BREAK[it.code]) it.std_cost_breakdown = STD_BREAK[it.code];
}
for (const m of MODELS) {
  IDX[m].std_cost_usd_at_plan = r2(STD[m] / PLAN_FX);
  IDX[m].material_usd_fob = r2(materialUsd(m));
  IDX[m].research_material_usd = RESEARCH_MAT[m];
  IDX[m].research_std_cost_usd = RESEARCH_STD[m];
  IDX[m].gross_margin_pct_at_sell_in = r2((SELL_IN[m] - STD[m]) / SELL_IN[m] * 100);
}

// ---------------------------------------------------------------- routings
export const FA_OPS = [   // seq, code, name, kind, cycle factor vs bottleneck, operators FA-1, operators FA-2, scan point of the simulation
  [10, 'CHS', 'Chassis loading + 2D serial label (unit created)', 'work', 0.8, 1, 1, false],
  [20, 'LED', 'LED bar mounting + harness', 'work', 0.92, 1, 2, false],
  [30, 'BLT', 'BLU lighting test (automatic)', 'test', 0.3, 0, 0, false],
  [40, 'OPT', 'Reflector, diffuser plate, optical films (+QD film), middle frame - clean booth', 'work', 0.95, 1, 2, false],
  [50, 'OCM', 'Open cell mounting - clean booth, ionizer, COF/FFC to T-CON (open-cell serial scan)', 'work', 1.0, 2, 3, true],
  [60, 'FLP', 'Flip onto soft conveyor (automatic flipper)', 'work', 0.4, 0, 0, false],
  [70, 'BRD', 'Main board, power board, IR/key board, speakers, wire dressing (serial scans)', 'work', 0.96, 3, 3, true],
  [80, 'BCV', 'Back cover + auto-screwdriver + rating/energy label', 'work', 0.93, 2, 2, false],
  [90, 'SWD', 'Power-on, SW download, serial/MAC/keys written by MES', 'test', 0.85, 1, 1, false],
  [100, 'AGE', 'In-line aging 30 min (pitch shown, dwell 1,800 s)', 'test', 0.9, 0, 0, false],
  [110, 'WB', 'White balance / gamma (colour analyzer)', 'test', 0.7, 1, 1, true],
  [120, 'FT', 'Function test (HDMI, USB, tuner, Wi-Fi, BT, audio, IR) - 2 positions', 'test', 0.94, 2, 2, true],
  [130, 'HPT', 'Hi-pot 3,000 V AC 2 s + ground continuity (Class II)', 'test', 0.2, 1, 1, false],
  [140, 'VIS', 'Final visual (mura, dead pixel, leakage, cosmetics)', 'inspection', 0.8, 1, 1, true],
  [150, 'ACC', 'Accessories: remote, stand, screws bag, cord, kit', 'work', 0.75, 1, 1, false],
  [160, 'PKG', 'Packing: bag, EPS, carton, carton label (EAN + serial)', 'pack', 0.9, 1, 1, true],
  [170, 'WCK', 'Weight check +/- 80 g (automatic)', 'inspection', 0.25, 0, 0, false],
  [180, 'PAL', 'Palletizing, stretch wrap, SSCC pallet label', 'pack', 0.85, 1, 1, false],
];
export const LINE_OVERHEAD = { 'FA-1': { leader: 1, material_handler: 2, repair_tech: 1 }, 'FA-2': { leader: 1, material_handler: 2, repair_tech: 1 } };   // people per shift outside the stations
export const CREW = {};
for (const line of ['FA-1', 'FA-2']) {
  const ops = sum(FA_OPS, (o) => (line === 'FA-1' ? o[5] : o[6]));
  const ovh = sum(Object.values(LINE_OVERHEAD[line]));
  CREW[line] = { operators: ops, overhead: ovh, total: ops + ovh };
}
const SMT_MB = [[10, 'LDR', 'Board loader + laser 2D serial', 'work', 8], [20, 'SPP', 'Solder paste printing', 'work', 12], [30, 'SPI', '3D solder paste inspection', 'inspection', 11],
  [40, 'MT1', 'Chip mounter (passives)', 'work', 13], [50, 'MT2', 'Flexible mounter (SoC, DDR, eMMC, modules, connectors) - bottleneck, 28 s per 2-up panel', 'work', 14],
  [60, 'RFL', 'Reflow 10-zone', 'work', 10], [70, 'AOI', 'Automatic optical inspection', 'inspection', 11], [80, 'ICT', 'In-circuit test', 'test', 12], [90, 'FCT', 'Board function test + SW flash (2 fixtures)', 'test', 13]];
const SMT_PBS = [[10, 'LDR', 'Board loader + laser 2D serial', 'work', 4], [20, 'SPP', 'Solder paste printing', 'work', 6], [30, 'SPI', '3D solder paste inspection', 'inspection', 5],
  [40, 'MT1', 'Chip mounter - bottleneck, 24 s per 4-up panel', 'work', 6], [60, 'RFL', 'Reflow 10-zone', 'work', 4], [70, 'AOI', 'Automatic optical inspection', 'inspection', 5]];
const THT = [[10, 'INS', 'Manual insertion (transformer, e-caps) - 6 positions', 'work', 20], [20, 'WAV', 'Wave solder', 'work', 12], [30, 'TUP', 'Touch-up + visual (2 positions)', 'inspection', 18],
  [40, 'ICT', 'In-circuit test', 'test', 15], [50, 'HPT', 'Hi-pot primary/secondary', 'test', 6], [60, 'BRN', 'Burn-in rack 10 min (pitch shown)', 'test', 19]];
const opsOf = (rows) => rows.map(([seq, code, name, kind, cycle_s]) => ({ seq, code, name, kind, mandatory: true, cycle_s }));
export const ROUTINGS = {};
for (const m of MODELS) {
  ROUTINGS[m] = { item: m, revision: 1, status: 'approved', approved_at: '2026-05-20', lines: [LINE_OF[m]], slowest_op: 'OCM', ideal_cycle_s: CYCLE_FA[m],
    operations: FA_OPS.map(([seq, code, name, kind, f, , , sim]) => ({ seq, code, name, kind, mandatory: true, sim_scan: sim, cycle_s: Math.max(1, rint(CYCLE_FA[m] * f)) })) };
}
for (const m of ['MB-U', 'MB-Q']) ROUTINGS[m] = { item: m, revision: 1, status: 'approved', approved_at: '2026-05-20', lines: ['SMT-1'], slowest_op: 'MT2', ideal_cycle_s: 14, operations: opsOf(SMT_MB) };
for (const m of ['PBS-S', 'PBS-L']) ROUTINGS[m] = { item: m, revision: 1, status: 'approved', approved_at: '2026-05-20', lines: ['SMT-1'], slowest_op: 'MT1', ideal_cycle_s: 6, operations: opsOf(SMT_PBS) };
for (const m of ['PB-S', 'PB-L']) ROUTINGS[m] = { item: m, revision: 1, status: 'approved', approved_at: '2026-05-20', lines: ['THT-1'], slowest_op: 'INS', ideal_cycle_s: 20, operations: opsOf(THT) };
export const CYCLE = Object.fromEntries(Object.entries(ROUTINGS).map(([k, v]) => [k, v.ideal_cycle_s]));
export const SMT_LINE_SEC_PER = { 'MB-U': 14, 'MB-Q': 14, 'PBS-S': 6, 'PBS-L': 6 };   // ideal line seconds per board
export const CAP_SMT_SEC = NET_SHIFT_SEC * OEE_PLAN.SMT;   // usable ideal seconds per shift
export const CAP_THT_PER_SHIFT = Math.floor(NET_SHIFT_SEC * OEE_PLAN.THT / 20);

// ---------------------------------------------------------------- plant model (GMES) and layout (Space Planner)
export const SHIFTS = [
  { code: 'A', name: 'Shift A (day)', start: '07:00', end: '15:00', rest_min: 60, planned_stop_min: 30, net_production_min: 390 },
  { code: 'B', name: 'Shift B (evening)', start: '15:00', end: '23:00', rest_min: 60, planned_stop_min: 30, net_production_min: 390 },
  { code: 'C', name: 'Shift C (night)', start: '23:00', end: '07:00', rest_min: 60, planned_stop_min: 30, net_production_min: 390, used: 'FA-2 only, production dates 2026-08-29 to 2026-09-24 (overnight shift belongs to the date it starts)' },
];
export const EQUIP = { LDR: 'Orion SMT loader LM-2', SPP: 'Orion SMT printer SP-700', SPI: 'Kestrel 3D SPI-3', MT1: 'Orion chip mounter CM-60 (60k CPH)', MT2: 'Orion flexible mounter FM-25',
  RFL: 'ThermaFlow 10-zone reflow', AOI: 'Kestrel AOI-5', ICT: 'Kestrel ICT-3', FCT: 'NVE FCT fixture x2', INS: 'Insertion conveyor 6 positions', WAV: 'ThermaFlow WS-350 wave solder',
  TUP: 'Touch-up benches x2', HPT: 'Kestrel hi-pot HP-5', BRN: 'Burn-in rack 40 positions' };
export const FA_EQUIP = { BLT: 'BLU lighting tester', SWD: 'SW download server + 4 docking positions', AGE: 'Aging conveyor 30 min, 40 positions', WB: 'Colour analyzer + WB jig', FT: 'Function test rack x2',
  HPT: 'Hi-pot tester 3 kV AC', WCK: 'Check weigher', FLP: 'Automatic flipper', BCV: 'Auto screwdriver gantry' };
export const PLANT = [];
{
  const node = (code, type, parent, name, o = {}) => { PLANT.push({ code, type, parent, name, capacity_per_shift: null, crew: null, ...o }); };
  node('EG-NV1', 'plant', null, 'Nile Vision 10th of Ramadan plant', { address: COMPANY.address });
  for (const [c, n] of [['A-RCV', 'Receiving dock + IQC'], ['A-RMW', 'Raw material warehouse'], ['A-SMT', 'SMT / THT area (ESD protected area)'], ['A-FA', 'Final assembly hall'],
    ['A-QA', 'OQC, ORT aging room, quality lab'], ['A-FGW', 'Finished goods warehouse and shipping'], ['A-MNT', 'Maintenance workshop'], ['A-OFF', 'Offices, training room, clinic, canteen']]) node(c, 'area', 'EG-NV1', n);
  node('SMT-1', 'line', 'A-SMT', 'SMT line 1 (main boards + power-board SMT side)', { capacity_per_shift: Math.floor(CAP_SMT_SEC / 14), crew: 2, shifts: ['A', 'B'], oee_plan: OEE_PLAN.SMT, note: 'capacity shown for main boards; power boards use 6 s per board on the same line' });
  node('THT-1', 'line', 'A-SMT', 'THT / wave / test cell (power boards)', { capacity_per_shift: CAP_THT_PER_SHIFT, crew: 0, shifts: ['A', 'B'], oee_plan: OEE_PLAN.THT });
  node('FA-1', 'line', 'A-FA', 'Final assembly line 1 (43-55")', { capacity_per_shift: CAP_FA['NV-55U'], crew: CREW['FA-1'].overhead, shifts: ['A', 'B'], oee_plan: OEE_PLAN.FA, capacity_by_item: { 'NV-43U': CAP_FA['NV-43U'], 'NV-50U': CAP_FA['NV-50U'], 'NV-55U': CAP_FA['NV-55U'] } });
  node('FA-2', 'line', 'A-FA', 'Final assembly line 2 (55-65")', { capacity_per_shift: CAP_FA['NV-65U'], crew: CREW['FA-2'].overhead, shifts: ['A', 'B', 'C'], oee_plan: OEE_PLAN.FA, capacity_by_item: { 'NV-55Q': CAP_FA['NV-55Q'], 'NV-65U': CAP_FA['NV-65U'], 'NV-65Q': CAP_FA['NV-65Q'] } });
  const st = (line, op, name, kind, crew) => {
    node(`${line}-${op}`, 'station', line, name, { op, kind, crew });
    const eq = line.startsWith('FA') ? FA_EQUIP[op] : EQUIP[op];
    if (eq) node(`EQ-${line}-${op}`, 'equipment', `${line}-${op}`, eq, { vendor: eq.split(' ')[0], serial: `${op}${String(fnv1a32(line + op) % 100000).padStart(5, '0')}`, installed_on: line === 'FA-2' ? '2023-02-01' : '2022-03-15' });
  };
  for (const [, c, n, k] of SMT_MB) st('SMT-1', c, n, k, { LDR: 0, SPP: 1, SPI: 0, MT1: 1, MT2: 1, RFL: 1, AOI: 1, ICT: 0, FCT: 0 }[c]);
  st('SMT-1', 'RPR', 'Board repair / rework bench', 'repair', 1);
  for (const [, c, n, k] of THT) st('THT-1', c, n, k, { INS: 6, WAV: 1, TUP: 2, ICT: 1, HPT: 1, BRN: 1 }[c]);
  st('THT-1', 'RPR', 'Power board repair bench (touch-up benches double as repair)', 'repair', 0);
  for (const line of ['FA-1', 'FA-2']) {
    for (const o of FA_OPS) st(line, o[1], o[2], o[3], line === 'FA-1' ? o[5] : o[6]);
    st(line, 'RPR', 'Repair station (unit returns to the SAME test)', 'repair', 0);
  }
}
export const STATION_CREW_SMT = 5, STATION_CREW_THT = 12;   // per shift: SPP/MT1/MT2/RFL/AOI = 5 ; INS 6 + WAV 1 + TUP 2 + ICT 1 + HPT 1 + BRN 1 = 12

export const WAREHOUSES = [
  { code: 'WH-RM', name: 'Raw material and packaging warehouse', kind: 'raw', plant_stock: true },
  { code: 'WH-SF', name: 'Semi-finished boards supermarket (ESD racks)', kind: 'semi', plant_stock: true },
  { code: 'WH-FG', name: 'Finished goods warehouse', kind: 'finished', plant_stock: true },
  { code: 'QA-HOLD', name: 'Quarantine / blocked stock (created by Mizan on the first lot decision; here from day 1)', kind: 'blocked', plant_stock: false },
  { code: 'WH-RTN', name: 'Customer returns (RMA)', kind: 'returns', plant_stock: false },
  { code: 'WH-SCR', name: 'Scrap and return-to-vendor', kind: 'scrap', plant_stock: false },
];

export function buildLayout() {
  const T = 10000;   // Space Planner ticks (0.1 mm) per metre
  const els = [], zones = [];
  const el = (id, category, x, y, w, d, h, o = {}) => els.push({ item_id: id, name: o.name || id, category, x: rint(x * T), y: rint(y * T), rotation_mdeg: 0, w: rint(w * T), d: rint(d * T), h: rint(h * T), ...(o.ref ? { eco_ref: o.ref } : {}), ...(o.meta ? { meta: o.meta } : {}) });
  const zone = (id, kind, x, y, w, d, ref) => zones.push({ id, kind, polygon: [[x, y], [x + w, y], [x + w, y + d], [x, y + d]].map(([a, b]) => [rint(a * T), rint(b * T)]), ...(ref ? { eco_ref: ref } : {}) });
  const nodeRef = (code, type = 'plant_node') => ({ type, code });
  for (const [c, x, y, w, d] of [['A-RCV', 0, 70, 30, 20], ['A-RMW', 0, 20, 30, 50], ['A-SMT', 32, 62, 40, 26], ['A-FA', 32, 8, 100, 50], ['A-QA', 74, 62, 26, 26], ['A-FGW', 134, 8, 26, 80], ['A-MNT', 102, 62, 30, 26], ['A-OFF', 0, 0, 30, 18]]) zone(c, 'area', x, y, w, d, nodeRef(c));
  for (const [line, y0, pitch] of [['FA-1', 16, 5.0], ['FA-2', 38, 5.2]]) {
    zone(line, 'line', 36, y0 - 2, 94, 9, nodeRef(line));
    let x = 38;
    for (const o of FA_OPS) {
      const long = o[1] === 'AGE';
      el(`${line}-${o[1]}`, 'station', x, y0, long ? 12 : pitch - 0.4, long ? 6 : 3, 2.2, { ref: nodeRef(`${line}-${o[1]}`), meta: { kind: ['test', 'inspection'].includes(o[3]) ? 'inspection' : o[1] === 'PAL' ? 'sink' : o[1] === 'CHS' ? 'source' : 'machine', step: o[0] } });
      x += long ? 12.4 : pitch;
    }
    el(`${line}-RPR`, 'station', 70, y0 + 6, 6, 3, 2.2, { ref: nodeRef(`${line}-RPR`), meta: { kind: 'buffer', step: 999 } });
  }
  let x = 34;
  for (const [s, c] of SMT_MB) { el(`SMT-1-${c}`, 'station', x, 80, 3.6, 2.4, 1.8, { ref: nodeRef(`SMT-1-${c}`), meta: { kind: 'machine', step: s } }); x += 4.2; }
  el('SMT-1-RPR', 'station', 34, 75, 4, 2, 1.8, { ref: nodeRef('SMT-1-RPR'), meta: { kind: 'buffer' } });
  x = 34;
  for (const [s, c] of THT) { el(`THT-1-${c}`, 'station', x, 66, 5, 2.4, 1.8, { ref: nodeRef(`THT-1-${c}`), meta: { kind: 'machine', step: s } }); x += 5.6; }
  el('THT-1-RPR', 'station', 70, 66, 3, 2, 1.8, { ref: nodeRef('THT-1-RPR'), meta: { kind: 'buffer' } });
  for (const [c, x0, y0, w, d, name] of [['WH-RM', 2, 22, 26, 46, 'Raw material racks (1,400 pallet positions)'], ['QA-HOLD', 2, 72, 10, 8, 'Quarantine / hold cage (red)'], ['IQC-BENCH', 14, 72, 14, 8, 'IQC bench + panel lighting test'],
    ['WH-SF', 60, 76, 10, 8, 'Semi-finished board supermarket (ESD racks)'], ['WH-FG', 136, 20, 22, 60, 'FG block stacking + racking (2,400 pallet positions)'], ['WH-RTN', 136, 10, 10, 8, 'Customer returns / RMA'],
    ['WH-SCR', 148, 10, 10, 8, 'Scrap and return-to-vendor'], ['DOCK-OUT', 150, 82, 10, 6, '6 shipping docks (2 container docks)'], ['DOCK-IN', 0, 86, 30, 4, '3 receiving docks'],
    ['QA-ORT', 76, 64, 12, 10, 'ORT aging room 48 h (60 positions)'], ['QA-OQC', 90, 64, 10, 10, 'OQC AQL table']]) {
    const isWh = ['WH-RM', 'QA-HOLD', 'WH-SF', 'WH-FG', 'WH-RTN', 'WH-SCR'].includes(c);
    el(c, 'storage', x0, y0, w, d, c === 'WH-RM' || c === 'WH-FG' ? 6 : 2.5, { name, ref: isWh ? { type: 'warehouse', code: c } : undefined });
  }
  el('C-SHIFT-ZONE', 'amenity', 100, 12, 16, 10, 3, { name: 'Night-shift rest room and canteen corner (C shift crew 26)' });
  return { project: 'NVE-EG-NV1-Layout', revision: 1, length_unit: '0.1mm', origin: 'south-west corner of the main hall 160 x 90 m', flow: 'west (receiving) to east (shipping)',
    note: 'meters x 10,000 = ticks; eco_ref.code is resolved to the GMES node id (UUID) at link time; Space Planner owns geometry only', items: els, zones };
}
export const LAYOUT = buildLayout();

// ---------------------------------------------------------------- parties
export const CUSTOMERS = [
  { code: 'C-NME', name: 'Nile Mega Electronics S.A.E.', segment: 'key account, omnichannel electronics retailer (B.TECH-like, invented)', country: 'EG', city: 'Cairo (DC 6th of October)', currency: 'EGP', terms_days: 60, payment_method: 'bank transfer', credit_limit_egp: 450000000, discount_pct: 1.5, delivery_days: ['Sat', 'Tue'], order_lead_days: 4, share: 0.30, priority: 1, pay_delay_mean: 3, tilt: { 'NV-43U': 0.9, 'NV-50U': 1, 'NV-55U': 1.1, 'NV-55Q': 1.2, 'NV-65U': 1.2, 'NV-65Q': 1.3 } },
  { code: 'C-TBH', name: 'TwoBee Home Appliances Co.', segment: 'key account, appliance specialist (2B-like, invented)', country: 'EG', city: 'Cairo (Nasr City)', currency: 'EGP', terms_days: 60, payment_method: 'bank transfer', credit_limit_egp: 160000000, discount_pct: 1, delivery_days: ['Sun', 'Wed'], order_lead_days: 5, share: 0.18, priority: 2, pay_delay_mean: 6, tilt: { 'NV-43U': 1, 'NV-50U': 1.1, 'NV-55U': 1, 'NV-55Q': 1, 'NV-65U': 1, 'NV-65Q': 0.9 } },
  { code: 'C-CRS', name: 'Crescent Hypermarkets Egypt', segment: 'key account, hypermarket chain (Carrefour-like, invented)', country: 'EG', city: 'Cairo (Maadi DC)', currency: 'EGP', terms_days: 45, payment_method: 'bank transfer', credit_limit_egp: 120000000, discount_pct: 0, delivery_days: ['Mon', 'Thu'], order_lead_days: 3, share: 0.14, priority: 2, pay_delay_mean: 8, tilt: { 'NV-43U': 1.3, 'NV-50U': 1.2, 'NV-55U': 1, 'NV-55Q': 0.7, 'NV-65U': 0.8, 'NV-65Q': 0.6 } },
  { code: 'C-ORB', name: 'Orbit Retail Egypt', segment: 'key account, electronics and mobile retailer (Raya-like, invented)', country: 'EG', city: 'Giza', currency: 'EGP', terms_days: 60, payment_method: 'bank transfer', credit_limit_egp: 120000000, discount_pct: 1, delivery_days: ['Mon'], order_lead_days: 5, share: 0.14, priority: 2, pay_delay_mean: 5, tilt: { 'NV-43U': 1, 'NV-50U': 1, 'NV-55U': 1, 'NV-55Q': 1, 'NV-65U': 1, 'NV-65Q': 1 } },
  { code: 'C-SQM', name: 'SouqMasr Online', segment: 'e-commerce retailer, own stock (invented)', country: 'EG', city: 'Cairo (Obour fulfilment centre)', currency: 'EGP', terms_days: 30, payment_method: 'bank transfer', credit_limit_egp: 60000000, discount_pct: 0, delivery_days: ['Sun', 'Tue', 'Thu'], order_lead_days: 2, share: 0.10, priority: 3, pay_delay_mean: 4, tilt: { 'NV-43U': 1.3, 'NV-50U': 1.2, 'NV-55U': 1.1, 'NV-55Q': 0.8, 'NV-65U': 0.8, 'NV-65Q': 0.6 } },
  { code: 'C-DDU', name: 'Delta Dealers Union (Mansoura)', segment: "traditional dealers' buying group (invented)", country: 'EG', city: 'Mansoura, Dakahlia', currency: 'EGP', terms_days: 30, payment_method: 'post-dated cheques (PDC) handed over at delivery, dated delivery + 30 days', credit_limit_egp: 45000000, discount_pct: -2, delivery_days: ['Wed'], order_lead_days: 3, share: 0.14, priority: 4, pay_delay_mean: 2, pdc: true, tilt: { 'NV-43U': 1.2, 'NV-50U': 1, 'NV-55U': 1.2, 'NV-55Q': 0.6, 'NV-65U': 0.9, 'NV-65Q': 0.5 } },
  { code: 'C-AWT', name: 'Al-Waha Trading Co.', segment: 'export distributor KSA (invented)', country: 'SA', city: 'Jeddah', currency: 'USD', terms_days: 0, payment_method: 'irrevocable LC at sight, confirmed by Nile Export Bank', incoterm: 'CIF Jeddah Islamic Port', credit_limit_usd: 3000000, vat: '0 % zero-rated export', priority: 2, export: true },
  { code: 'C-TST', name: 'Tigris Star Trading Co.', segment: 'export distributor Iraq (invented)', country: 'IQ', city: 'Baghdad', currency: 'USD', terms_days: 30, payment_method: '30 % T/T advance with order + 70 % documentary collection (CAD, D/P), 30 days from B/L', incoterm: 'CIF Umm Qasr', credit_limit_usd: 1500000, vat: '0 % zero-rated export', priority: 2, export: true },
];
export const CUST = Object.fromEntries(CUSTOMERS.map((c) => [c.code, c]));
export const DOM = CUSTOMERS.filter((c) => !c.export).map((c) => c.code);
export const netPrice = (cust, model) => Math.round(SELL_IN[model] * (1 - CUST[cust].discount_pct / 100) * 100) / 100;   // EGP ex VAT per set

export const BANKS = [
  { code: 'B-DCB-EGP', bank: 'Delta Commercial Bank (invented)', branch: '10th of Ramadan', account_no: '1002-448210-001', currency: 'EGP', type: 'current', gl: '1101', use: 'main EGP operating account' },
  { code: 'B-DCB-OD', bank: 'Delta Commercial Bank (invented)', branch: '10th of Ramadan', account_no: '1002-448210-OD1', currency: 'EGP', type: 'overdraft', gl: '2101', limit_egp: 250000000, rate_pct: 21.5, basis: 'CBE lending rate 20.00 % + 1.5 % [S25]', interest: 'actual/365 on the daily drawn balance, debited on the last bank day of the month' },
  { code: 'B-DCB-USD', bank: 'Delta Commercial Bank (invented)', branch: '10th of Ramadan', account_no: '1002-448210-840', currency: 'USD', type: 'current', gl: '1102', use: 'import T/T payments and LC settlements' },
  { code: 'B-DCB-LC', bank: 'Delta Commercial Bank (invented)', branch: 'Trade Finance, Cairo', currency: 'USD', type: 'LC + CAD facility', limit_usd: 9000000, fees: 'LC opening commission 0.40 % flat + USD 60 SWIFT, paid from B-DCB-USD', gl: null },
  { code: 'B-NXB-EGP', bank: 'Nile Export Bank (invented)', branch: 'Heliopolis', account_no: '220-771903-01', currency: 'EGP', type: 'current', gl: '1103', use: 'domestic collections and PDC deposits' },
  { code: 'B-NXB-USD', bank: 'Nile Export Bank (invented)', branch: 'Heliopolis', account_no: '220-771903-84', currency: 'USD', type: 'current', gl: '1104', use: 'export proceeds (LC at sight, CAD)' },
  { code: 'B-MHB-PAY', bank: 'Misr Horizon Bank (invented)', branch: '10th of Ramadan', account_no: '3301-09914-7', currency: 'EGP', type: 'payroll', gl: '1105', use: 'payroll (salary transfers to employee cards)' },
];
