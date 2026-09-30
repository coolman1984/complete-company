// The ceramic demo: one tile order through the real applications, small data, built in about a minute.
//   master data (Mizan) -> plant, routing and BOM per m2 (GMES) -> S&OP plan + distributor order (Mizan) -> MRP (GMES)
//   -> requisitions -> one purchase order -> goods receipt with lots (Mizan) -> incoming inspection: a glaze lot with the
//   wrong shade is partly rejected and cannot be loaded (GMES; rejected kilos go to QA-HOLD in Mizan) -> work order,
//   materials consumed by lot, kiln stoppage, output reported as one shade/caliber lot, losses by reason (GMES)
//   -> production valued through WIP (Mizan) -> delivery of that one shade lot, invoice, payment (Mizan)
//   -> crew requirement reaches HR -> the cross-system verifier.
// Story, numbers and the click-by-click script: STORYBOARD.md next to this file; plan: plan/60-CERAMIC-PITCH.md.
// The applications must already be running, paired and empty: scripts/Start-IntegratedDemo.ps1 -Scenario ceramic.
// Usage: node run.mjs   (reads CHAIN_INPUT: { urls: {mizan, gmes, hr?}, logins: {mizan, gmes, hr?} })
import { pair } from '../../portal/pair.mjs';
import { verify, printReport } from '../verify/verify.mjs';

const input = JSON.parse(process.env.CHAIN_INPUT);
const { urls, logins } = input;
let failed = 0;
const log = (ok, name, detail = '') => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`); if (!ok) failed++; };
const must = (cond, name, detail = '') => { log(!!cond, name, cond ? '' : String(detail).slice(0, 600)); if (!cond) throw new Error('stopped at: ' + name); };

function client(base, cookieName) {
  let cookie = '';
  return async (method, path, body, opts = {}) => {
    const r = await fetch(base + path, {
      method, signal: AbortSignal.timeout(60_000),
      headers: { 'content-type': 'application/json', origin: base, ...(cookie ? { cookie } : {}) },
      body: body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(body),
    });
    const set = r.headers.get('set-cookie');
    if (set && set.startsWith(cookieName + '=')) cookie = set.split(';')[0];
    const text = await r.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 200) }; }
    if (!r.ok && !opts.allow) throw new Error(`${method} ${path}: ${r.status} ${JSON.stringify(json?.error ?? json).slice(0, 300)}`);
    return opts.status ? { status: r.status, body: json } : json;
  };
}
const mizan = client(urls.mizan, 'mizan_sid'), gmes = client(urls.gmes, 'gmes_sid');
const hr = urls.hr ? client(urls.hr, 'hr_sid') : null;
let n = 0;
const cmd = (p = 'cer') => `${p}-${Date.now().toString(36)}-${(++n).toString(36)}`;
// the plant's production day (Cairo time, a day starts at 07:00): documents dated by it never precede the stock they use
function plantDay() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const d = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
  if (`${p.hour}:${p.minute}` < '07:00') d.setUTCDate(d.getUTCDate() - 1);
  return d;
}
const day = (add = 0) => new Date(plantDay().getTime() + add * 86_400_000).toISOString().slice(0, 10);
const pump = async () => { for (let i = 0; i < 3; i++) { await mizan('POST', '/api/eco/sync'); await gmes('POST', '/api/eco/push'); } };
const U = 1000;

// ---------------------------------------------------------------- the numbers of the story (plan 60 §1), all exact
const ORDER_M2 = 1440;                       // 1,000 cartons of 1.44 m2
const BOM = { 'CLAY-RED': '18', FELDSPAR: '4', 'GLZ-WHT': '0.8', 'CTN-60': '0.7' };   // per m2 of tile
const NEED = { 'CLAY-RED': 25920, FELDSPAR: 5760, 'GLZ-WHT': 1152, 'CTN-60': 1008 };   // ORDER_M2 x BOM
const GLAZE_OK = 1000, GLAZE_REJECTED = 152;  // the wrong-shade glaze lot
const GOOD = 1300, SCRAP = { 'kiln-crack': 40, 'press-lamination': 20, downgrade: 80 };  // 1300 + 140 = 1440
const SHADE_LOT = 'S07-C2';                   // shade 07, caliber 2: the one lot the customer receives
const LINE = 'L1', OPS = ['PR', 'DR', 'GL', 'KL', 'SP'];

try {
  console.log('setup');
  await gmes('POST', '/api/auth/login', { login: logins.gmes.user, password: logins.gmes.password });
  await mizan('POST', '/api/auth/login', { username: logins.mizan.user, password: logins.mizan.password });
  if (hr) await hr('POST', '/api/login', { username: logins.hr.user, password: logins.hr.password });

  // ---------------------------------------------------------------- 1. Mizan master data
  const clayCo = (await mizan('POST', '/api/parties', { kind: 'supplier', name: 'Aswan Clay & Minerals' })).id;
  const glazeCo = (await mizan('POST', '/api/parties', { kind: 'supplier', name: 'Frit & Glaze Supplies' })).id;
  const customer = (await mizan('POST', '/api/parties', { kind: 'customer', name: 'Delta Building Materials (distributor)' })).id;
  const item = (o) => mizan('POST', '/api/items', { kind: 'product', ...o }).then((r) => r.id);
  const raw = (o) => item({ tracking: 'batch', materialType: 'raw', procurementType: 'buy', ...o });
  const clay = await raw({ sku: 'CLAY-RED', nameEn: 'Red clay', nameAr: 'طفلة حمراء', unit: 'KG', leadTimeDays: 7, purchasePrice: 150 });
  const feldspar = await raw({ sku: 'FELDSPAR', nameEn: 'Feldspar', nameAr: 'فلسبار', unit: 'KG', leadTimeDays: 7, purchasePrice: 300 });
  const glaze = await raw({ sku: 'GLZ-WHT', nameEn: 'White glaze', nameAr: 'جليز أبيض', unit: 'KG', leadTimeDays: 10, purchasePrice: 4500 });
  const carton = await raw({ sku: 'CTN-60', nameEn: 'Carton 60x60 (1.44 m2)', nameAr: 'كرتونة ٦٠×٦٠', unit: 'PCS', leadTimeDays: 5, purchasePrice: 1200 });
  const tile = await item({ sku: 'TL-6060-WHT', nameEn: 'Porcelain tile 60x60 white, 1st grade', nameAr: 'بورسلين ٦٠×٦٠ أبيض فرز أول', unit: 'M2', tracking: 'batch', materialType: 'finished', procurementType: 'make', salePrice: 32000 });
  must([clay, feldspar, glaze, carton, tile].every(Boolean), 'Mizan has the four materials and the tile');
  const mid = { 'CLAY-RED': clay, FELDSPAR: feldspar, 'GLZ-WHT': glaze, 'CTN-60': carton };

  // ---------------------------------------------------------------- pairing (fresh applications)
  const paired = process.env.CHAIN_PAIRED === '1' ? { ok: true, steps: [] } : await pair({ urls, logins });
  must(paired.ok, 'the applications are paired', JSON.stringify(paired.steps.filter((s) => !s.ok)));
  await pump();
  const gItems = await gmes('GET', '/api/items');
  const gid = Object.fromEntries(gItems.map((i) => [i.code, i.id]));
  must([...Object.keys(BOM), 'TL-6060-WHT'].every((c) => gid[c]), 'GMES mirrors the materials and the tile', JSON.stringify(gItems.map((i) => i.code)));
  const main = (await gmes('GET', '/api/warehouses')).find((w) => w.code === 'MAIN');
  must(main, 'GMES mirrors the main warehouse');

  // ---------------------------------------------------------------- 2. GMES engineering: plant, shifts, routing, BOM, quality
  const plant = await gmes('POST', '/api/plant', { code: 'CP1', type: 'plant', nameEn: 'Tile plant' });
  const area = await gmes('POST', '/api/plant', { code: 'FL', type: 'area', parentId: plant.id, nameEn: 'Floor tiles' });
  const line = await gmes('POST', '/api/plant', { code: LINE, type: 'line', parentId: area.id, nameEn: 'Tile line 1', capacityPerShift: 2500 });
  const opName = { PR: 'Pressing', DR: 'Drying', GL: 'Glazing', KL: 'Kiln firing', SP: 'Sorting and packing' };
  for (const op of OPS) await gmes('POST', '/api/plant', { code: `${LINE}-${op}`, type: 'station', parentId: line.id, nameEn: opName[op] });
  await gmes('PUT', '/api/production-shifts/A', { nameEn: 'Day', start: '07:00', end: '15:00', breakMin: 40 });
  await gmes('PUT', '/api/production-shifts/B', { nameEn: 'Evening', start: '15:00', end: '23:00', breakMin: 40 });
  const route = await gmes('POST', '/api/routings', { itemId: gid['TL-6060-WHT'], operations: OPS.map((op, i) => ({ seq: (i + 1) * 10, code: op, nameEn: opName[op], ...(op === 'SP' ? { kind: 'pack' } : {}) })) });
  await gmes('POST', `/api/routings/${route.id}/approve`, { version: (await gmes('GET', `/api/routings/${route.id}`)).version });
  const opOf = { 'CLAY-RED': 'PR', FELDSPAR: 'PR', 'GLZ-WHT': 'GL', 'CTN-60': 'SP' };
  const bom = await gmes('POST', '/api/boms', { itemId: gid['TL-6060-WHT'], lines: Object.entries(BOM).map(([code, qtyPer]) => ({ componentId: gid[code], qtyPer, opCode: opOf[code], scan: 'lot' })) });
  await gmes('POST', `/api/boms/${bom.id}/approve`, { version: (await gmes('GET', `/api/boms/${bom.id}`)).version });
  await gmes('POST', '/api/qms/plans', { code: 'IQC-CLAY', nameEn: 'Incoming clay (moisture, residue)', stage: 'iqc', itemId: gid['CLAY-RED'], aql: '2.5' });
  await gmes('POST', '/api/qms/plans', { code: 'IQC-GLZ', nameEn: 'Incoming glaze (shade, viscosity)', stage: 'iqc', itemId: gid['GLZ-WHT'], aql: '0.65' });
  await gmes('PUT', '/api/stop-reasons/kiln-temp', { commandId: cmd('rsn'), name_en: 'Kiln temperature out of range', name_ar: 'حرارة الفرن خارج الحدود', loss: 'breakdown' });
  await gmes('PUT', '/api/pln/item-lines', { itemId: gid['TL-6060-WHT'], lines: [LINE] });
  for (const op of OPS) await gmes('PUT', '/api/pln/crew-settings', { node: `${LINE}-${op}`, crew: op === 'SP' ? 4 : 2 });
  log(true, 'GMES knows the tile line: press, dryer, glazing, kiln, sorting');

  // ---------------------------------------------------------------- 3. demand: an approved S&OP plan and a distributor order
  const cycle = (await mizan('POST', '/api/sop/cycles', { period: day().slice(0, 7) })).id;
  const ver = (await mizan('POST', `/api/sop/cycles/${cycle}/versions`, { baselineMonths: 3 })).id;
  await mizan('PUT', `/api/sop/versions/${ver}/lines`, { lines: [{ itemId: tile, month: day(60).slice(0, 7), qty: 20000 * U }] });
  await mizan('POST', `/api/sop/versions/${ver}/approve`);
  const so = await mizan('POST', '/api/sales/orders', { customerId: customer, orderDate: day(), confirm: true, lines: [{ itemId: tile, quantity: ORDER_M2 * U, requestedDate: day(21) }] });
  const soView = await mizan('GET', `/api/sales/orders/${so.id}`);
  await pump();
  must((await gmes('GET', '/api/sales-orders')).some((o) => o.code === soView.number), `the order ${soView.number} (${ORDER_M2} m2) reaches the factory`);

  // ---------------------------------------------------------------- 4. planning
  const run = await gmes('POST', '/api/pln/runs');
  must(run.code, 'GMES runs MRP', JSON.stringify(run));
  const reqs = (await gmes('GET', '/api/pln/requisitions')).filter((r) => r.status === 'open' && r.need_date <= day(22));
  const need = {};
  for (const r of reqs) need[r.item.code] = (need[r.item.code] ?? 0) + Number(r.qty);
  must(Object.entries(NEED).every(([c, q]) => need[c] === q), 'MRP asks for exactly the clay, feldspar, glaze and cartons of the order',
    `wanted ${JSON.stringify(NEED)}, got ${JSON.stringify(need)}`);
  const planned = (await gmes('GET', '/api/pln/planned-orders?status=planned')).filter((p) => p.item.code === 'TL-6060-WHT' && p.due_date <= day(22));
  must(planned.reduce((a, p) => a + Number(p.qty), 0) === ORDER_M2, `planning proposes ${ORDER_M2} m2 of tile for the order`, JSON.stringify(planned.map((p) => [p.qty, p.due_date])));
  must((await gmes('GET', `/api/pln/crew?from=${day()}&to=${day(30)}`)).length >= 1, 'planning knows the crew the line needs');
  await pump();

  // ---------------------------------------------------------------- 5. purchasing and receiving (clay and feldspar from one supplier, glaze and cartons from the other)
  const mReqs = (await mizan('GET', '/api/purchase-requisitions')).filter((r) => r.status === 'open' && r.need_date <= day(22));
  must(mReqs.length === 4, 'the four requisitions of the order arrived in Mizan', JSON.stringify(mReqs.map((r) => [r.number, r.need_date])));
  const itemOfReq = (r) => r.item_id ?? r.itemId ?? r.item?.id;
  const bySupplier = [[clayCo, [clay, feldspar]], [glazeCo, [glaze, carton]]];
  const mainWh = (await mizan('GET', '/api/inventory/warehouses')).find((w) => w.is_default);
  const lotOf = { [clay]: 'CL-2609', [feldspar]: 'FS-2609', [glaze]: 'GZ-2609', [carton]: 'CT-2609' };
  for (const [supplierId, items] of bySupplier) {
    const ids = mReqs.filter((r) => items.includes(itemOfReq(r))).map((r) => r.id);
    must(ids.length === 2, 'two requisitions per supplier', JSON.stringify(mReqs.slice(0, 2)));
    const po = await mizan('POST', '/api/purchase-requisitions/convert', { ids, supplierId, date: day() });
    await mizan('POST', `/api/purchase-orders/${po.id}/approve`);
    const poView = await mizan('GET', `/api/purchase-orders/${po.id}`);
    must(poView.status === 'open' && poView.lines.length === 2, `purchase order ${poView.number ?? ''} is approved`, JSON.stringify(poView.status));
    const gr = await mizan('POST', '/api/inventory/receipts', { supplierId, poId: po.id, date: day(), warehouseId: mainWh.id, post: true,
      lines: poView.lines.map((l) => ({ itemId: l.item_id, quantity: l.quantity, unitCost: l.unit_price, poLineId: l.id, lots: [{ lotNo: lotOf[l.item_id], qty: l.base_quantity ?? l.quantity }] })) });
    must(gr.id, 'the goods are received in Mizan with their lots', JSON.stringify(gr));
  }
  await pump();
  const lots = await gmes('GET', '/api/qms/incoming-lots');
  const lot = (code) => lots.find((l) => l.item_code === code);
  must(lots.length === 4, 'GMES holds four incoming lots', JSON.stringify(lots.map((l) => [l.item_code, l.lot_no, l.status])));
  must(lot('CLAY-RED').status === 'pending_iqc' && lot('GLZ-WHT').status === 'pending_iqc' && lot('FELDSPAR').status === 'accepted',
    'clay and glaze wait for inspection; feldspar and cartons are usable', JSON.stringify(lots.map((l) => [l.item_code, l.status])));

  // the glaze lot is not released yet: the glazing station refuses it
  const blocked = await gmes('POST', `/api/stations/${LINE}-GL/loads`, { commandId: cmd(), itemId: gid['GLZ-WHT'], lotNo: lot('GLZ-WHT').lot_no, warehouseId: main.id }, { allow: true, status: true });
  must(blocked.status >= 400 && blocked.body?.error?.code === 'lot.not_released', 'a glaze lot waiting for inspection cannot be loaded on the glazing line', JSON.stringify(blocked.body));

  await gmes('POST', '/api/qms/incoming-lots/decision', { itemId: gid['CLAY-RED'], lotNo: lot('CLAY-RED').lot_no, decision: 'accepted' });
  await gmes('POST', '/api/qms/defects', { code: 'GLAZE-SHADE', nameEn: 'Glaze shade off standard', nameAr: 'درجة لون الجليز مختلفة', category: 'appearance', severity: 'major' }, { allow: true });
  const dec = await gmes('POST', '/api/qms/incoming-lots/decision', { itemId: gid['GLZ-WHT'], lotNo: lot('GLZ-WHT').lot_no, decision: 'partially_accepted',
    acceptedQty: String(GLAZE_OK), rejectedQty: String(GLAZE_REJECTED), defectCodes: ['GLAZE-SHADE'] });
  must(dec.status === 'partially_accepted', `the glaze lot is partly rejected: ${GLAZE_OK} kg good, ${GLAZE_REJECTED} kg wrong shade`, JSON.stringify(dec));
  await pump();
  const qa = (await mizan('GET', '/api/inventory/warehouses')).find((w) => w.code === 'QA-HOLD');
  must(qa, `Mizan moved the ${GLAZE_REJECTED} kg of rejected glaze to the quality-hold warehouse`);

  // ---------------------------------------------------------------- 6. production: one work order, materials by lot, a kiln stop, one shade lot out, losses by reason
  const tilePlanned = (await gmes('GET', '/api/pln/planned-orders?status=planned')).filter((p) => p.item.code === 'TL-6060-WHT' && p.due_date <= day(22));
  const released = [];
  for (const p of tilePlanned) {
    await gmes('POST', `/api/pln/planned-orders/${p.id}/firm`);
    released.push(await gmes('POST', `/api/pln/planned-orders/${p.id}/release`, { commandId: cmd('rel'), productionDate: day() }));
  }
  const wo = released[0]?.workOrder;
  must(wo?.id && released.length === 1, 'the planned order is released as one work order', JSON.stringify(released));
  const planned1 = Number((await gmes('GET', `/api/work-orders/${wo.id}`)).planned_qty);
  must(planned1 === ORDER_M2, `the work order is for ${ORDER_M2} m2`, String(planned1));

  // materials issued by lot for the whole order; the glaze we have is the 1,000 good kilos, and the order needs 1,152
  const issue = { 'CLAY-RED': NEED['CLAY-RED'], FELDSPAR: NEED.FELDSPAR, 'GLZ-WHT': GLAZE_OK, 'CTN-60': Math.round(GOOD * 0.7) };
  for (const [code, qty] of Object.entries(issue)) {
    await gmes('POST', `/api/work-orders/${wo.id}/consume`, { commandId: cmd('use'), itemId: gid[code], qty: String(qty), warehouseId: main.id, lotNo: lot(code).lot_no, station: `${LINE}-${opOf[code]}`, productionDate: day() });
  }
  log(true, 'clay, feldspar, glaze and cartons issued to the work order by lot');

  const stop = await gmes('POST', '/api/stoppages', { commandId: cmd('stop'), line: LINE, station: `${LINE}-KL`, reason: 'kiln-temp' });
  await gmes('POST', `/api/stoppages/${stop.id}/end`, { commandId: cmd('stop') });
  log(true, 'a kiln stoppage (temperature) is recorded against the kiln station');

  await gmes('POST', `/api/work-orders/${wo.id}/complete`, { commandId: cmd('out'), qty: String(GOOD), lotNo: SHADE_LOT, station: `${LINE}-SP`, productionDate: day() });
  for (const [reasonCode, qty] of Object.entries(SCRAP)) {
    await gmes('POST', `/api/work-orders/${wo.id}/scrap`, { commandId: cmd('scr'), qty: String(qty), reasonCode, station: `${LINE}-${reasonCode === 'press-lamination' ? 'PR' : reasonCode === 'kiln-crack' ? 'KL' : 'SP'}`, productionDate: day() });
  }
  const woAfter = await gmes('GET', `/api/work-orders/${wo.id}`);
  must(Number(woAfter.completed_qty) === GOOD && Number(woAfter.scrapped_qty) === ORDER_M2 - GOOD,
    `${GOOD} m2 of first grade in shade lot ${SHADE_LOT}; ${ORDER_M2 - GOOD} m2 lost (kiln cracks, lamination, downgrade)`, JSON.stringify([woAfter.completed_qty, woAfter.scrapped_qty]));
  await gmes('POST', `/api/work-orders/${wo.id}/close`, { commandId: cmd('close') });
  await pump();
  const wip = (await mizan('GET', '/api/mfg/gmes-wip')).find((w) => w.code === wo.code);
  must(wip && wip.status === 'closed' && wip.received_qty === GOOD * U && wip.issued_value > 0,
    'Mizan valued the production through work in progress', JSON.stringify(wip));
  log(wip.issued_value === wip.received_value, 'the close left nothing in work in progress (the losses are inside the cost of the good m2)', JSON.stringify(wip));

  // ---------------------------------------------------------------- 7. delivery of one shade lot, invoice, cash
  const soLine = (await mizan('GET', `/api/sales/orders/${so.id}`)).lines[0];
  // GMES reported the tiles into stock as lot S07-C2; the delivery names that lot, so the customer gets one shade only
  const delivery = (lots) => mizan('POST', '/api/sales/deliveries', { soId: so.id, date: day(), reference: `${soView.number}/${SHADE_LOT}`, post: true,
    lines: [{ soLineId: soLine.id, qty: GOOD * U, warehouseId: mainWh.id, lots }] }, { allow: true, status: true });
  let del = await delivery([{ lotNo: SHADE_LOT, qty: GOOD * U }]);
  if (del.status >= 400) {
    // the demo goes on, but says plainly what is missing: Mizan did not keep the lot GMES reported for the production
    console.log(`  NOTE Mizan refused the delivery by lot ${SHADE_LOT} (${JSON.stringify(del.body?.error ?? del.body).slice(0, 200)}); delivering without the lot`);
    del = await delivery(null);
  }
  del = del.body;
  must(del?.id, `${GOOD} m2 of shade lot ${SHADE_LOT} delivered to the distributor`, JSON.stringify(del));
  const soAfter = await mizan('GET', `/api/sales/orders/${so.id}`);
  must(soAfter.lines[0].delivered_qty === GOOD * U && soAfter.status === 'partially_delivered', `the order shows ${GOOD} of ${ORDER_M2} m2 delivered`, JSON.stringify([soAfter.lines[0].delivered_qty, soAfter.status]));
  const invoiceId = (await mizan('POST', '/api/sales/invoices/from-deliveries', { deliveryIds: [del.id], date: day(), post: true })).id;
  const invoice = await mizan('GET', `/api/documents/${invoiceId}`);
  must(invoice?.status === 'posted' && invoice.total > 0, 'the invoice is posted', JSON.stringify(invoice?.status));
  const accounts = await mizan('GET', '/api/payments/accounts');
  const bank = (accounts.bank ?? accounts.cash ?? accounts)[0] ?? accounts[0];
  const pay = await mizan('POST', '/api/payments', { direction: 'in', date: day(), partyId: customer, partyRole: 'customer', accountId: bank.id, amount: invoice.total, method: 'bank_transfer', allocations: [{ documentId: invoiceId, amount: invoice.total }], post: true });
  must(pay.id, 'the distributor pays the invoice', JSON.stringify(pay));

  // ---------------------------------------------------------------- 8. people
  if (hr) {
    const rows = await hr('GET', `/api/staffing/gap?from=${day()}&to=${day(30)}`);
    log(rows.length > 0, 'HR shows the staffing gap of the tile line from the crew requirements', `${rows.length} rows`);
  }
  // ---------------------------------------------------------------- 9. the cross-system verifier and the advisor
  await pump();
  console.log('verify');
  const report = await verify({ mizan, gmes, hr, day: day() });
  printReport(report);
  if (!report.ok) failed += report.checks.filter((c) => !c.ok).length;
  try {
    const adv = await mizan('GET', `/api/advisor?asOf=${day()}`);
    console.log(`  (the Mizan advisor lists ${adv.findings?.length ?? 0} finding(s) to show in the demo)`);
  } catch { /* the advisor is optional in an edition */ }
  console.log(failed ? `CERAMIC: ${failed} check(s) failed` : 'CERAMIC: PASSED');
} catch (e) {
  console.error('CERAMIC: STOPPED —', e.message);
  for (const [name, call] of [['GMES', gmes], ['Mizan', mizan]]) {
    try { const parked = await call('GET', '/api/integration/events?status=parked'); console.error(`  parked in ${name}'s outbox (refused by the other side):`, JSON.stringify(parked.map((p) => [p.type, p.consumer, p.code, p.message]).slice(0, 8))); } catch { /* not reachable */ }
  }
  process.exitCode = 1;
}
if (failed) process.exitCode = 1;
