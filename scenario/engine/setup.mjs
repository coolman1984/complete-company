// Master data of the book, entered through the applications' own APIs (never a database), in the order the applications need it.
//   1. Mizan owns items, parties, prices, currencies, rates; 2. the applications are paired and Mizan's masters reach GMES;
//   3. GMES gets what it owns: plant, shifts and calendar, routings, bills of materials, inspection plans, packing, planning settings.
// Every function returns the ids the day loop needs. `U` = Mizan's quantity unit (thousandths).
export const U = 1000;
const cents = (x) => Math.round(x * 100);
const MATERIAL = { raw: 'raw', semi: 'semi_finished', finished: 'finished', packaging: 'packaging', service: 'service' };

/** Mizan tracks what GMES scans: lots for the parts that are scanned by lot (the open cells too: see the book's note), serials for what is made here. */
export function trackingOf(item) {
  if (item.batch_output) return 'batch';   // tiles are made and delivered by lot, not by serial number
  if (item.type === 'semi' || item.type === 'finished') return 'serial';
  return item.tracking === 'none' || item.nonstock ? 'none' : 'batch';
}

export async function setupMizan({ mz, book, log }) {
  await mz('POST', '/api/currencies', { code: 'USD', nameEn: 'US Dollar', nameAr: 'دولار أمريكي', symbol: '$' }, { allow: true });
  for (const [date, rate] of book.fx) await mz('POST', '/api/fx/rates', { currency: 'USD', date, rate: Math.round(rate * 1_000_000) }, { allow: true });
  log(true, 'USD and its daily rates are in Mizan', `${book.fx.length} days`);

  const supplier = {}, customer = {};
  for (const s of book.suppliers) supplier[s.code] = (await mz('POST', '/api/parties', { kind: 'supplier', name: s.name, paymentTermsDays: paymentDays(s.terms) })).id;
  for (const c of book.customers) customer[c.code] = (await mz('POST', '/api/parties', { kind: 'customer', name: c.name, paymentTermsDays: c.terms_days,
    ...(c.credit_limit_egp ? { creditLimit: cents(c.credit_limit_egp) } : {}) })).id;

  const item = {};
  for (const it of book.items) {
    const usd = it.purchase_currency === 'USD';
    const price = it.purchase_price == null ? 0 : cents(usd ? it.purchase_price * book.company.plan_fx : it.purchase_price);
    item[it.code] = (await mz('POST', '/api/items', {
      sku: it.code, nameEn: it.name_en.slice(0, 200), nameAr: it.name_en.slice(0, 200), kind: it.nonstock ? 'service' : 'product', unit: it.uom, trackStock: !it.nonstock,
      salePrice: it.type === 'finished' ? cents(it.sell_in_egp) : 0, purchasePrice: price, tracking: trackingOf(it),
      materialType: MATERIAL[it.type] ?? null, procurementType: it.procurement, leadTimeDays: it.lead_time_days ?? 0,
      moq: Math.round((it.moq || 0) * U), safetyStock: Math.round((it.safety_stock || 0) * U), lotSizeRule: it.lot_rule ?? 'lot_for_lot', lotSize: it.lot_rule === 'lot_for_lot' ? 0 : Math.round((it.lot_size || 0) * U),
      ...(it.supplier && supplier[it.supplier] ? { defaultSupplierId: supplier[it.supplier] } : {}),
    })).id;
  }
  // cost centres: one per cost centre the organisation names (the payroll HR books lands on them)
  const costCenter = {};
  for (const o of book.people?.org?.filter((x) => x.cost_center) ?? []) costCenter[o.cost_center] = (await mz('POST', '/api/cost-centers', { code: o.cost_center, nameEn: o.name.slice(0, 100), nameAr: o.name.slice(0, 100) }, { allow: true }))?.id;
  if (Object.keys(costCenter).length) log(true, 'Mizan has the cost centres', `${Object.keys(costCenter).length} cost centres`);
  log(true, 'Mizan holds the parties and items', `${book.suppliers.length} suppliers, ${book.customers.length} customers, ${book.items.length} items`);
  return { supplier, customer, item, costCenter };
}

export const DEFECTS = [['BOARD-SOLDER', 'Solder defect', 'solder', 'major'], ['CELL-BRIGHT-DOT', 'Open cell bright dot', 'display', 'major'], ['FUNC-FAIL', 'Function test failure', 'function', 'major'],
  ['SCRATCH', 'Scratch or cosmetic damage', 'cosmetic', 'minor'], ['LOT-BAD', 'Incoming lot below quality', 'incoming', 'major']];
export const REPAIR_CODES = [['cause', 'COMPONENT', 'Faulty component'], ['cause', 'ASSEMBLY', 'Assembly error'], ['action', 'REPLACE', 'Part replaced'], ['action', 'REWORK', 'Reworked']];

const paymentDays =(terms) => ({ TT30_70: 0, LC_SIGHT: 0, NET5: 5, NET10: 10, NET15: 15, NET30: 30, NET45: 45, NET60: 60 }[terms] ?? 30);

/**
 * GMES: only after pairing and one exchange, so that the items and warehouses have arrived. Returns the ids and the scan plan of every
 * routing: the operations a unit really passes (the others exist in the routing but are optional, see `scanPlan`).
 */
export async function setupGmes({ gm, book, log }) {
  const gid = Object.fromEntries((await gm('GET', '/api/items')).map((i) => [i.code, i.id]));
  const missing = book.items.filter((i) => !i.nonstock && !gid[i.code]).map((i) => i.code);
  if (missing.length) throw new Error(`GMES has not mirrored ${missing.length} items yet (${missing.slice(0, 5).join(', ')})`);
  const warehouses = await gm('GET', '/api/warehouses');
  const main = warehouses.find((w) => w.is_default) ?? warehouses[0];

  // plant tree, parents first
  const node = {};
  const order = ['plant', 'area', 'line', 'station', 'equipment'];
  for (const n of [...book.plant].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))) {
    node[n.code] = (await gm('POST', '/api/plant', { code: n.code, type: n.type, nameEn: (n.name ?? n.code).slice(0, 120), ...(n.parent ? { parentId: node[n.parent]?.id ?? node[n.parent] } : {}),
      ...(n.type === 'line' && n.capacity_per_shift ? { capacityPerShift: n.capacity_per_shift } : {}) }, { allow: false })).id;
  }
  for (const s of book.shifts) await gm('PUT', `/api/production-shifts/${s.code}`, { nameEn: s.name, start: s.start, end: s.end, breakMin: s.rest_min });
  for (const h of book.calendar.holidays) await gm('PUT', `/api/production-calendar/${h.date}`, { kind: 'holiday', note: h.name });
  log(true, 'GMES has the plant, shifts and calendar', `${Object.keys(node).length} nodes`);

  // routings and bills of materials
  const scanPlan = {};
  const boms = {};
  for (const code of Object.keys(book.routings)) {
    const r = book.routings[code], bom = book.boms[code];
    const lines = bom.lines.filter((l) => !book.items.find((i) => i.code === l.component)?.nonstock);
    const scanLine = (l) => (l.scan === 'serial' && bomComponentTracking(book, l.component) !== 'serial' ? 'lot' : l.scan);
    const scanned = new Set(lines.filter((l) => scanLine(l) !== 'none').map((l) => l.op));
    const ops = r.operations;
    const first = ops[0].code, last = ops[ops.length - 1].code;
    scanPlan[code] = ops.filter((o) => o.code === first || o.code === last || scanned.has(o.code)).map((o) => o.code);
    const routing = await gm('POST', '/api/routings', { itemId: gid[code], operations: ops.map((o) => ({ seq: o.seq, code: o.code, nameEn: o.name.slice(0, 120), kind: o.kind === 'pack' && o.code !== last ? 'work' : o.kind, cycleSec: o.cycle_s,
      mandatory: scanPlan[code].includes(o.code) })) });
    await gm('POST', `/api/routings/${routing.id}/approve`, { version: (await gm('GET', `/api/routings/${routing.id}`)).version });
    const b = await gm('POST', '/api/boms', { itemId: gid[code], lines: lines.map((l) => ({ componentId: gid[l.component], qtyPer: String(l.qty_per), opCode: l.op, scan: scanLine(l) })) });
    await gm('POST', `/api/boms/${b.id}/approve`, { version: (await gm('GET', `/api/boms/${b.id}`)).version });
    boms[code] = b.id;
  }
  log(true, 'GMES has approved routings and bills of materials', `${Object.keys(book.routings).length} routings`);

  // quality: incoming inspection of the open cells, outgoing inspection of every finished set
  const plans = {};
  for (const it of book.items) {
    if (it.code.startsWith('OC-') || it.iqc) await gm('POST', '/api/qms/plans', { code: `IQC-${it.code}`, nameEn: `Incoming ${it.code}`, stage: 'iqc', itemId: gid[it.code], aql: '0.65' });
    if (it.type === 'finished') plans[it.code] = (await gm('POST', '/api/qms/plans', { code: `OQC-${it.code}`, nameEn: `Outgoing ${it.code}`, stage: 'oqc', itemId: gid[it.code], aql: '0.65' })).id;
  }
  for (const [code, nameEn, category, severity] of book.defects ?? DEFECTS) await gm('PUT', `/api/defect-codes/${code}`, { nameEn, category, severity });
  if (book.production?.mode !== 'batch') for (const [kind, code, nameEn] of REPAIR_CODES) await gm('PUT', `/api/repair-codes/${kind}/${code}`, { nameEn });

  // packing and planning
  // a plant that ships tiles by lot has no pallet specifications (see the book's production mode)
  if (book.production?.mode !== 'batch') for (const m of book.meta.models) await gm('PUT', `/api/pack-specs/${gid[m]}`, { perPallet: book.packing[m].per_pallet, perContainer: { TRUCK: Math.max(1, Math.floor(book.packing[m].per_truck / book.packing[m].per_pallet)),
    '40HC': Math.max(1, Math.floor(book.packing[m].per_40hc / book.packing[m].per_pallet)) } });   // GMES counts pallets per container
  for (const it of book.items.filter((i) => i.type !== 'raw' && i.type !== 'packaging' && i.type !== 'service')) await gm('PUT', '/api/pln/item-lines', { itemId: gid[it.code], lines: [it.line] });
  for (const st of book.people.station_requirements) if (node[st.station] && st.crew) await gm('PUT', '/api/pln/crew-settings', { node: st.station, crew: st.crew });
  log(true, 'GMES has inspection plans, packing and planning settings', '');
  return { gid, node, main, boms, scanPlan, plans, warehouses };
}

const bomComponentTracking = (book, code) => trackingOf(book.items.find((i) => i.code === code));
