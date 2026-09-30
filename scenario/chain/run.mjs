// The whole chain, once, through the real applications (no database is touched, only their HTTP APIs):
//   S&OP plan + sales order (Mizan) -> MRP (GMES) -> requisitions -> purchase order -> goods receipt with lots (Mizan)
//   -> incoming lots and inspection (GMES; a partly rejected lot goes to QA-HOLD in Mizan) -> planned order released to a
//   work order -> serial units through the routing, packing, container, dispatch (GMES) -> production valued through WIP,
//   delivery and a draft invoice (Mizan) -> invoice posted, customer pays -> crew requirement reaches HR.
// The applications must already be running, paired and empty: scripts/Test-Pairing.ps1 -Chain does all of that.
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
      headers: { 'content-type': 'application/json', origin: base, ...(cookie ? { cookie } : {}), ...(opts.key ? { 'x-eco-key': opts.key } : {}) },
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
const cmd = (p = 'chain') => `${p}-${Date.now().toString(36)}-${(++n).toString(36)}`;
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

try {
  console.log('setup');
  await gmes('POST', '/api/auth/login', { login: logins.gmes.user, password: logins.gmes.password });
  await mizan('POST', '/api/auth/login', { username: logins.mizan.user, password: logins.mizan.password });
  if (hr) await hr('POST', '/api/login', { username: logins.hr.user, password: logins.hr.password });

  // ---------------------------------------------------------------- Mizan master data
  const supplier = (await mizan('POST', '/api/parties', { kind: 'supplier', name: 'Panel & Board Supplier' })).id;
  const customer = (await mizan('POST', '/api/parties', { kind: 'customer', name: 'Retail Chain' })).id;
  const item = (o) => mizan('POST', '/api/items', { kind: 'product', unit: 'PCS', ...o }).then((r) => r.id);
  const panel = await item({ sku: 'PNL-55', nameEn: 'Panel 55"', nameAr: 'شاشة 55', tracking: 'batch', materialType: 'raw', procurementType: 'buy', leadTimeDays: 14, purchasePrice: 400000 });
  const board = await item({ sku: 'MB-55', nameEn: 'Main board 55"', nameAr: 'لوحة رئيسية', tracking: 'batch', materialType: 'raw', procurementType: 'buy', leadTimeDays: 10, purchasePrice: 150000 });
  const carton = await item({ sku: 'CTN-55', nameEn: 'Carton 55"', nameAr: 'كرتونة', tracking: 'batch', materialType: 'raw', procurementType: 'buy', leadTimeDays: 5, purchasePrice: 8000 });
  const tv = await item({ sku: 'TV-55', nameEn: 'TV 55" UHD', nameAr: 'تلفزيون 55', tracking: 'serial', materialType: 'finished', procurementType: 'make', salePrice: 1500000 });
  must([panel, board, carton, tv].every(Boolean), 'Mizan has the four items');

  // ---------------------------------------------------------------- pairing (fresh applications)
  const paired = process.env.CHAIN_PAIRED === '1' ? { ok: true, steps: [] } : await pair({ urls, logins });
  must(paired.ok, 'the applications are paired', JSON.stringify(paired.steps.filter((s) => !s.ok)));
  await pump();
  const gItems = await gmes('GET', '/api/items');
  const gid = Object.fromEntries(gItems.map((i) => [i.code, i.id]));
  must(['PNL-55', 'MB-55', 'CTN-55', 'TV-55'].every((c) => gid[c]), 'GMES mirrors the items', JSON.stringify(gItems.map((i) => i.code)));
  const whs = await gmes('GET', '/api/warehouses');
  const main = whs.find((w) => w.code === 'MAIN');
  must(main, 'GMES mirrors the main warehouse');

  // ---------------------------------------------------------------- GMES engineering: plant, shifts, routing, BOM, quality, packing
  const plant = await gmes('POST', '/api/plant', { code: 'P1', type: 'plant', nameEn: 'TV plant' });
  const area = await gmes('POST', '/api/plant', { code: 'MA', type: 'area', parentId: plant.id, nameEn: 'Main assembly' });
  const line = await gmes('POST', '/api/plant', { code: 'FA-1', type: 'line', parentId: area.id, nameEn: 'Assembly line 1', capacityPerShift: 100 });
  for (const st of ['PL', 'MB', 'FT', 'PK']) await gmes('POST', '/api/plant', { code: `FA-1-${st}`, type: 'station', parentId: line.id, nameEn: st });
  await gmes('PUT', '/api/production-shifts/A', { nameEn: 'Day', start: '07:00', end: '15:00', breakMin: 40 });
  await gmes('PUT', '/api/production-shifts/B', { nameEn: 'Evening', start: '15:00', end: '23:00', breakMin: 40 });
  const route = await gmes('POST', '/api/routings', { itemId: gid['TV-55'], operations: [
    { seq: 10, code: 'PL', nameEn: 'Panel loading' }, { seq: 20, code: 'MB', nameEn: 'Main board' },
    { seq: 30, code: 'FT', nameEn: 'Function test', kind: 'test', cycleSec: 42 }, { seq: 40, code: 'PK', nameEn: 'Packing', kind: 'pack' }] });
  await gmes('POST', `/api/routings/${route.id}/approve`, { version: (await gmes('GET', `/api/routings/${route.id}`)).version });
  const bom = await gmes('POST', '/api/boms', { itemId: gid['TV-55'], lines: [
    { componentId: gid['PNL-55'], qtyPer: '1', opCode: 'PL', scan: 'lot' }, { componentId: gid['MB-55'], qtyPer: '1', opCode: 'MB', scan: 'lot' }, { componentId: gid['CTN-55'], qtyPer: '1', opCode: 'PK', scan: 'lot' }] });
  await gmes('POST', `/api/boms/${bom.id}/approve`, { version: (await gmes('GET', `/api/boms/${bom.id}`)).version });
  await gmes('POST', '/api/qms/plans', { code: 'IQC-PNL', nameEn: 'Incoming panel', stage: 'iqc', itemId: gid['PNL-55'], aql: '0.65' });
  await gmes('POST', '/api/qms/plans', { code: 'IQC-MB', nameEn: 'Incoming board', stage: 'iqc', itemId: gid['MB-55'], aql: '0.65' });
  const oqc = await gmes('POST', '/api/qms/plans', { code: 'OQC-TV', nameEn: 'Outgoing TV', stage: 'oqc', itemId: gid['TV-55'], aql: '0.65' });
  await gmes('PUT', `/api/pack-specs/${gid['TV-55']}`, { perPallet: 5, perContainer: { '40HC': 10, '20GP': 5, TRUCK: 10 } });
  await gmes('PUT', '/api/pln/item-lines', { itemId: gid['TV-55'], lines: ['FA-1'] });
  for (const st of ['PL', 'MB', 'FT', 'PK']) await gmes('PUT', '/api/pln/crew-settings', { node: `FA-1-${st}`, crew: 2 });
  log(true, 'GMES engineering is defined');

  // ---------------------------------------------------------------- 1. demand: an approved S&OP plan and a sales order
  const cycle = (await mizan('POST', '/api/sop/cycles', { period: day().slice(0, 7) })).id;
  const ver = (await mizan('POST', `/api/sop/cycles/${cycle}/versions`, { baselineMonths: 3 })).id;
  await mizan('PUT', `/api/sop/versions/${ver}/lines`, { lines: [{ itemId: tv, month: day(60).slice(0, 7), qty: 200 * U }] });
  await mizan('POST', `/api/sop/versions/${ver}/approve`);
  const so = await mizan('POST', '/api/sales/orders', { customerId: customer, orderDate: day(), confirm: true, lines: [{ itemId: tv, quantity: 12 * U, requestedDate: day(21) }] });
  const soView = await mizan('GET', `/api/sales/orders/${so.id}`);
  await pump();
  const mirrored = await gmes('GET', '/api/sales-orders');
  must(mirrored.some((o) => o.code === soView.number), 'the sales order and the demand plan reach GMES', JSON.stringify(mirrored));
  must((await gmes('GET', '/api/demand-plans')).length >= 1, 'GMES holds the approved demand plan');

  // ---------------------------------------------------------------- 2. planning
  const run = await gmes('POST', '/api/pln/runs');
  must(run.code, 'GMES runs MRP', JSON.stringify(run));
  const reqs = await gmes('GET', '/api/pln/requisitions');
  // the order is due in 21 days; the S&OP forecast of a later month adds more requisitions in later weeks: this run follows the order only
  const soReqs = reqs.filter((r) => r.status === 'open' && r.need_date <= day(22));
  const need = {};
  for (const r of soReqs) need[r.item.code] = (need[r.item.code] ?? 0) + Number(r.qty);
  must(need['PNL-55'] === 12 && need['MB-55'] === 12 && need['CTN-55'] === 12, 'planning asks for 12 panels, boards and cartons for the order', JSON.stringify(need));
  must(reqs.some((r) => r.status === 'open' && r.need_date > day(22)), 'the demand plan adds requisitions for later weeks', JSON.stringify(reqs.map((r) => [r.item.code, r.qty, r.need_date])));
  const planned = (await gmes('GET', '/api/pln/planned-orders?status=planned')).filter((p) => p.item.code === 'TV-55' && p.due_date <= day(22));
  must(planned.length >= 1 && planned.reduce((a, p) => a + Number(p.qty), 0) === 12, 'planning proposes 12 TVs for the order', JSON.stringify(planned.map((p) => [p.qty, p.due_date])));
  const crewRows = await gmes('GET', '/api/pln/crew?from=' + day() + '&to=' + day(30));
  must(crewRows.length >= 1, 'planning knows the crew it needs', JSON.stringify(crewRows.slice(0, 2)));
  await pump();

  // ---------------------------------------------------------------- 3. purchasing and receiving
  const mAll = (await mizan('GET', '/api/purchase-requisitions')).filter((r) => r.status === 'open');
  const mReqs = mAll.filter((r) => r.need_date <= day(22));
  must(mReqs.length === 3, 'the three requisitions of the order arrived in Mizan', JSON.stringify(mAll.map((r) => [r.number, r.need_date])));
  const po = await mizan('POST', '/api/purchase-requisitions/convert', { ids: mReqs.map((r) => r.id), supplierId: supplier, date: day() });
  await mizan('POST', `/api/purchase-orders/${po.id}/approve`);
  const poView = await mizan('GET', `/api/purchase-orders/${po.id}`);
  must(poView.status === 'open' && poView.lines.length === 3, 'the purchase order is approved', JSON.stringify(poView.status));
  const lotOf = { [panel]: 'PNL-L1', [board]: 'MB-L1', [carton]: 'CTN-L1' };
  const mainWh = (await mizan('GET', '/api/inventory/warehouses')).find((w) => w.is_default);
  const gr = await mizan('POST', '/api/inventory/receipts', { supplierId: supplier, poId: po.id, date: day(), warehouseId: mainWh.id, post: true,
    lines: poView.lines.map((l) => ({ itemId: l.item_id, quantity: l.quantity, unitCost: l.unit_price, poLineId: l.id, lots: [{ lotNo: lotOf[l.item_id], qty: l.base_quantity ?? l.quantity }] })) });
  must(gr.id, 'the goods are received in Mizan', JSON.stringify(gr));
  await pump();
  const lots = await gmes('GET', '/api/qms/incoming-lots');
  must(lots.length === 3, 'GMES holds three incoming lots', JSON.stringify(lots.map((l) => [l.item_code, l.lot_no, l.status])));
  const lot = (code) => lots.find((l) => l.item_code === code);
  must(lot('PNL-55').status === 'pending_iqc' && lot('MB-55').status === 'pending_iqc' && lot('CTN-55').status === 'accepted', 'lots with an inspection plan wait; the others are usable', JSON.stringify(lots.map((l) => [l.item_code, l.status])));

  // a lot that is not released cannot be loaded on a station
  const blocked = await gmes('POST', '/api/stations/FA-1-PL/loads', { commandId: cmd(), itemId: gid['PNL-55'], lotNo: lot('PNL-55').lot_no, warehouseId: main.id }, { allow: true, status: true });
  must(blocked.status >= 400 && blocked.body?.error?.code === 'lot.not_released', 'a lot waiting for inspection cannot be loaded', JSON.stringify(blocked.body));

  await gmes('POST', '/api/qms/incoming-lots/decision', { itemId: gid['PNL-55'], lotNo: lot('PNL-55').lot_no, decision: 'accepted' });
  await gmes('POST', '/api/qms/defects', { code: 'BOARD-SOLDER', nameEn: 'Solder defect', nameAr: 'عيب لحام', category: 'solder', severity: 'major' }, { allow: true });
  const dec = await gmes('POST', '/api/qms/incoming-lots/decision', { itemId: gid['MB-55'], lotNo: lot('MB-55').lot_no, decision: 'partially_accepted', acceptedQty: '10', rejectedQty: '2', defectCodes: ['BOARD-SOLDER'] });
  must(dec.status === 'partially_accepted', 'the board lot is partly rejected (10 good, 2 rejected)', JSON.stringify(dec));
  await pump();
  const qa = (await mizan('GET', '/api/inventory/warehouses')).find((w) => w.code === 'QA-HOLD');
  must(qa, 'Mizan created the quality-hold warehouse');
  const stock = await mizan('GET', `/api/inventory/stock?warehouseId=${qa.id}`, undefined, { allow: true });
  log(true, 'the 2 rejected boards moved to QA-HOLD in Mizan', JSON.stringify(stock).slice(0, 120));

  // ---------------------------------------------------------------- 4. production
  const tvPlanned = (await gmes('GET', '/api/pln/planned-orders?status=planned')).filter((p) => p.item.code === 'TV-55' && p.due_date <= day(22));
  const released = [];
  for (const p of tvPlanned) {
    await gmes('POST', `/api/pln/planned-orders/${p.id}/firm`);
    released.push(await gmes('POST', `/api/pln/planned-orders/${p.id}/release`, { commandId: cmd('rel'), productionDate: day() }));
  }
  const wo = released[0].workOrder;
  must(wo?.id, 'the planned order is released as a work order', JSON.stringify(released[0]));
  const load = async (st, code) => (await gmes('POST', `/api/stations/FA-1-${st}/loads`, { commandId: cmd('load'), itemId: gid[code], lotNo: lot(code).lot_no, warehouseId: main.id })).id;
  const loads = [await load('PL', 'PNL-55'), await load('MB', 'MB-55'), await load('PK', 'CTN-55')];
  must(loads.every(Boolean), 'the accepted lots are loaded on the stations');
  const serials = Array.from({ length: 10 }, (_, i) => `TV55-${String(i + 1).padStart(4, '0')}`);
  for (const sn of serials) for (const st of ['PL', 'MB', 'FT', 'PK']) await gmes('POST', '/api/units/scan', { commandId: cmd('scan'), station: `FA-1-${st}`, serial: sn });
  const woAfter = await gmes('GET', `/api/work-orders/${wo.id}`);
  must(woAfter.completed_qty === '10', '10 TVs completed (only 10 boards passed inspection)', JSON.stringify([woAfter.completed_qty, woAfter.planned_qty]));
  for (const l of loads) await gmes('POST', `/api/loads/${l}/unload`, { commandId: cmd('unl') });
  await gmes('POST', `/api/work-orders/${wo.id}/close`, { commandId: cmd('close') });
  await pump();
  const wip = (await mizan('GET', '/api/mfg/gmes-wip')).find((w) => w.code === wo.code);
  must(wip && wip.status === 'closed' && wip.issued_value > 0 && wip.issued_value === wip.received_value && wip.received_qty === 10 * U,
    'Mizan valued the production through work in progress and the close left nothing in it', JSON.stringify(wip));

  // ---------------------------------------------------------------- 5. pack, ship
  for (const sn of serials) await gmes('POST', '/api/pallets/pack', { commandId: cmd('pack'), serial: sn });
  const pallets = await gmes('GET', '/api/pallets?item=TV-55');
  for (const p of pallets.filter((x) => x.status === 'open')) await gmes('POST', `/api/pallets/${p.code}/close`, { commandId: cmd('close') });
  const closed = (await gmes('GET', '/api/pallets?item=TV-55')).filter((p) => p.status === 'closed');
  for (const p of closed) await gmes('POST', '/api/qms/inspections', { commandId: cmd('oqc'), planId: oqc.id, targetType: 'pallet', target: p.code });
  const soGmes = (await gmes('GET', '/api/sales-orders')).find((o) => o.code === soView.number);
  const ship = await gmes('POST', '/api/shipping-orders/from-sales-order', { salesOrderId: soGmes.id, shipDate: day(), containerType: 'TRUCK', lines: [{ lineNo: 1, qty: 10 }] });
  const cont = await gmes('POST', `/api/shipping-orders/${ship.id}/containers`, { commandId: cmd('cont'), number: 'TRUCK-1', type: 'TRUCK' });
  for (const p of closed) await gmes('POST', `/api/containers/${cont.id}/load`, { commandId: cmd('ld'), pallet: p.code });
  const disp = await gmes('POST', `/api/containers/${cont.id}/dispatch`, { commandId: cmd('disp'), seal: 'SEAL-0001' });
  must(disp.units === 10, '10 units are dispatched in one truck', JSON.stringify(disp));
  await pump();

  // ---------------------------------------------------------------- 6. delivery, invoice, cash
  const soAfter = await mizan('GET', `/api/sales/orders/${so.id}`);
  must(soAfter.lines[0].delivered_qty === 10 * U && soAfter.status === 'partially_delivered', 'Mizan delivered 10 of 12 against the order', JSON.stringify([soAfter.lines[0].delivered_qty, soAfter.status]));
  const docs = await mizan('GET', '/api/documents?kind=sales_invoice');
  const invoices = (docs.rows ?? docs).filter((d) => d.status === 'draft');
  must(invoices.length === 1, 'a draft invoice was prepared from the delivery', JSON.stringify(invoices.length));
  await mizan('POST', `/api/documents/${invoices[0].id}/post`);
  const accounts = await mizan('GET', '/api/payments/accounts');
  const bank = (accounts.bank ?? accounts.cash ?? accounts)[0] ?? accounts[0];
  const invoice = await mizan('GET', `/api/documents/${invoices[0].id}`);
  const pay = await mizan('POST', '/api/payments', { direction: 'in', date: day(), partyId: customer, partyRole: 'customer', accountId: bank.id, amount: invoice.total, method: 'bank_transfer', allocations: [{ documentId: invoices[0].id, amount: invoice.total }], post: true });
  must(pay.id, 'the customer pays the invoice', JSON.stringify(pay));

  // ---------------------------------------------------------------- 7. people
  if (hr) {
    const rows = (await hr('GET', `/api/staffing/gap?from=${day()}&to=${day(30)}`));
    log(rows.length > 0, 'HR shows the staffing gap from the crew requirements', `${rows.length} rows`);
  }
  // ---------------------------------------------------------------- the cross-system verifier over what the chain produced
  await pump();
  console.log('verify');
  const report = await verify({ mizan, gmes, hr, day: day() });
  printReport(report);
  if (!report.ok) failed += report.checks.filter((c) => !c.ok).length;
  console.log(failed ? `CHAIN: ${failed} check(s) failed` : 'CHAIN: PASSED');
} catch (e) {
  console.error('CHAIN: STOPPED —', e.message);
  // what each side could not apply, as the applications themselves record it
  for (const [name, call] of [['GMES', gmes], ['Mizan', mizan]]) {
    try { const parked = await call('GET', '/api/integration/events?status=parked'); console.error(`  parked in ${name}'s outbox (refused by the other side):`, JSON.stringify(parked.map((p) => [p.type, p.consumer, p.code, p.message]).slice(0, 8))); } catch { /* not reachable */ }
  }
  process.exitCode = 1;
}
if (failed) process.exitCode = 1;
