// The day loop: what the people of the plant do, one day at a time, through the applications' own screens' APIs.
// Each day, in this order (the clock moves forward through the plant's day, never back):
//   07:05 demand      approved S&OP plans and customer orders are entered in Mizan
//   07:15 planning    the applications exchange, GMES runs planning (MRP)
//   07:30 planner     planned orders that start within `release_days_ahead` are firmed and released as work orders
//   07:45 buyer       Mizan's requisitions that must be ordered within `review_days` become purchase orders, approved
//   08:00 receiving   goods that arrive today are received in Mizan (lots), quality decides each lot that has an inspection plan
//   09:00 production  released work orders run: lots loaded, serial units scanned along their routes, parts fitted, failures repaired
//   16:00 shipping    finished units are palletised, inspected, loaded and dispatched against the sales orders that are due
//   17:00 billing     the invoices Mizan prepared from the deliveries are posted; customers pay on their own days
// Nothing here reads a database; every number the verifier later checks was made by the applications.
import { addDays, dateList, diffDays, isWork, isBank, U as RND } from '../gen/lib.mjs';
import { U, trackingOf } from './setup.mjs';

const cents = (x) => Math.round(x * 100);
const q1000 = (x) => Math.round(x * U);
const upper = (s) => s.toUpperCase();

/** ISO 6346 container number with its check digit. */
function containerNo(owner, serial) {
  const body = owner + String(serial).padStart(6, '0');
  const val = (c) => { if (/\d/.test(c)) return Number(c); let n = 10; for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') { if (n % 11 === 0) n++; if (ch === c) return n; n++; } return 0; };
  const sum = [...body].reduce((a, c, i) => a + val(c) * 2 ** i, 0);
  return body + String((sum % 11) % 10);
}

export async function play({ h, book, ids, g, people, pump, log, say }) {
  const { mizan: mz, gmes: gm, hr } = h.clients;
  const { from, to } = book.meta.window;
  const itemOf = Object.fromEntries(book.items.map((i) => [i.code, i]));
  const codeOfMz = Object.fromEntries(Object.entries(ids.item).map(([c, id]) => [id, c]));
  const custOf = Object.fromEntries(book.customers.map((c) => [c.code, c]));
  const suppOf = Object.fromEntries(book.suppliers.map((s) => [s.code, s]));
  const workOn = Object.fromEntries(book.days.map((d) => [d.date, d.work]));
  const isWorkDay = (d) => workOn[d] ?? isWork(d);
  const hasIqc = (code) => code.startsWith('OC-') || !!itemOf[code]?.iqc;
  const batch = book.production?.mode === 'batch';   // tiles: made and delivered by lot (no serial numbers, no pallets)
  let cmdN = 0;
  const cmd = (p) => `${p}-${String(++cmdN).padStart(7, '0')}`;   // a command id is 8-100 characters and never repeats
  const clock = h.clock;
  const tm = (d, hhmm) => clock.at(d, hhmm);

  const S = {
    cycles: {}, sos: [], arrivals: [], wos: new Map(), lots: {}, plain: {}, semi: {}, fin: {}, loads: {}, receivables: [], serialN: {}, sealN: 0, truckN: 0, boxN: 0,
    counters: { orders: 0, orderUnits: 0, sop: 0, po: 0, receipts: 0, lots: 0, lotsRejected: 0, released: 0, unitsStarted: 0, unitsDone: {}, scans: 0, fails: 0, repairs: 0, scrapped: 0,
      shipped: 0, shipments: 0, containers: 0, deliveriesWithoutLot: 0, partialDeliveries: 0, creditHolds: 0, invoices: 0, payments: 0, shortages: 0, creditOverrides: 0, lateShipUnits: 0 },
    daily: [], lateBy: {}, shortWhy: {}, noSupplier: {}, finLots: {}, lotN: 0, loss: { pressed: 0, good: 0, scrap: 0 },
  };
  const bump = (k, n = 1) => { S.counters[k] += n; };
  const mainWh = (await mz('GET', '/api/inventory/warehouses')).find((w) => w.is_default);
  const bank = await (async () => { const a = await mz('GET', '/api/payments/accounts'); const list = a.bank ?? a.cash ?? a; return (Array.isArray(list) ? list : [])[0] ?? a[0]; })();
  const scanOf = (l) => (l.scan === 'serial' && trackingOf(itemOf[l.component]) !== 'serial' ? 'lot' : l.scan);
  const bomOf = (code) => book.boms[code]?.lines.filter((l) => !itemOf[l.component]?.nonstock).map((l) => ({ ...l, scan: scanOf(l), need: q1000(l.qty_per) })) ?? [];
  const stationOf = (line, op) => `${line}-${op}`;
  for (const code of Object.keys(book.routings)) for (const op of g.scanPlan[code]) {
    const line = book.routings[code].lines[0];
    if (!g.node[stationOf(line, op)]) throw new Error(`the plant model has no station ${stationOf(line, op)} for ${code}`);
  }

  // ------------------------------------------------------------------ opening stock: what the plant held before the window (a receipt in Mizan, dated the day before)
  async function openingStock() {
    const need = {};
    // The plant starts with the stock its buyers had ordered before the window: each component covers the orders due within its own
    // lead time (plus ten days) and a margin. Later demand is bought during the window, so purchasing, receiving and incoming
    // inspection are really played, and the long-lead parts (open cells, chips) are never short on day one.
    const explode = (code, qty, due) => { for (const l of book.boms[code]?.lines ?? []) {
      const q = qty * l.qty_per, it = itemOf[l.component];
      if (due <= addDays(from, (it?.lead_time_days ?? 0) + 10)) need[l.component] = (need[l.component] ?? 0) + q;
      explode(l.component, q, due);
    } };
    for (const e of book.events) if (e.kind === 'sales_order') for (const l of e.lines) explode(l.item, l.qty, l.requested);
    const bySupplier = {};
    for (const [code, qty] of Object.entries(need)) {
      const it = itemOf[code];
      if (!it || it.procurement !== 'buy' || it.nonstock || !it.supplier) continue;
      const units = Math.ceil(qty * 1.1);
      (bySupplier[it.supplier] ??= []).push({ code, units });
    }
    const day = addDays(from, -1);
    tm(from, '00:30');
    for (const [sup, lines] of Object.entries(bySupplier)) {
      const body = { supplierId: ids.supplier[sup], date: day, warehouseId: mainWh.id, post: true, reference: 'OPENING',
        lines: lines.map(({ code, units }) => {
          const it = itemOf[code];
          const price = cents(it.purchase_currency === 'USD' ? it.purchase_price * book.company.plan_fx : it.purchase_price);
          const lot = upper(`OPN-${code}`);
          return { itemId: ids.item[code], quantity: units * U, unitCost: price, ...(trackingOf(it) === 'batch' ? { lots: [{ lotNo: lot, qty: units * U }] } : {}) };
        }) };
      await mz('POST', '/api/inventory/receipts', body);
      for (const { code, units } of lines) registerStock(code, units * U, upper(`OPN-${code}`));
    }
    await pump();
    await decideLots(from);
    log(true, 'the opening stock is received', `${Object.keys(bySupplier).length} suppliers, ${Object.values(bySupplier).reduce((a, l) => a + l.length, 0)} items`);
  }
  function registerStock(code, qty, lot) {
    const it = itemOf[code];
    if (trackingOf(it) === 'batch') { (S.lots[code] ??= []).push({ lot, rem: qty, ok: !hasIqc(code), item: code }); bump('lots'); }
    else S.plain[code] = (S.plain[code] ?? 0) + qty;
  }
  /** Quality decides the lots that wait for incoming inspection (a few are partly or wholly rejected, by a fixed rule per lot). */
  async function decideLots() {
    const waiting = await gm('GET', '/api/qms/incoming-lots?status=pending_iqc');
    for (const l of waiting) {
      const code = l.item_code, lotNo = l.lot_no;
      const r = lotNo.startsWith('OPN-') ? 1 : RND('iqc', lotNo);   // the opening stock was inspected before the window
      const total = Number(l.qty);
      let body;
      if (r < 0.03 && total >= 2) { const rej = Math.max(1, Math.ceil(total * 0.02)); body = { decision: 'partially_accepted', acceptedQty: String(total - rej), rejectedQty: String(rej), defectCodes: ['LOT-BAD'] }; }
      else if (r < 0.035) body = { decision: 'rejected', defectCodes: ['LOT-BAD'] };
      else body = { decision: 'accepted' };
      await gm('POST', '/api/qms/incoming-lots/decision', { itemId: g.gid[code], lotNo, ...body });
      const st = (S.lots[code] ?? []).find((x) => x.lot === lotNo);
      if (st) {
        if (body.decision === 'rejected') { st.rem = 0; bump('lotsRejected'); }
        else { st.ok = true; if (body.decision === 'partially_accepted') { st.rem = q1000(Number(body.acceptedQty)); bump('lotsRejected'); } }
      }
    }
    if (waiting.length) await pump();
  }

  // ------------------------------------------------------------------ demand
  async function demand(day, events) {
    for (const e of events) {
      if (e.kind === 'sop') {
        const cyc = (S.cycles[e.cycle] ??= (await mz('POST', '/api/sop/cycles', { period: e.cycle })).id);
        const ver = (await mz('POST', `/api/sop/cycles/${cyc}/versions`, { baselineMonths: 3 })).id;
        await mz('PUT', `/api/sop/versions/${ver}/lines`, { lines: e.rows.map((r) => ({ itemId: ids.item[r.item], month: r.month, qty: r.qty * U })) });
        await mz('POST', `/api/sop/versions/${ver}/approve`);
        bump('sop');
      } else if (e.kind === 'sales_order') {
        const usd = e.channel === 'export';
        const body = { customerId: ids.customer[e.customer], orderDate: day, confirm: true, ...(e.reference ? { customerReference: String(e.reference).slice(0, 100) } : {}), ...(usd ? { currency: 'USD' } : {}),
          lines: e.lines.map((l) => ({ itemId: ids.item[l.item], quantity: Math.round(l.qty * U), unitPrice: cents(usd ? l.unit_price_usd : l.unit_price_egp), requestedDate: l.requested })) };
        let r = await mz('POST', '/api/sales/orders', body, { allow: true, status: true });
        if (!r.status || r.status >= 400) {
          const why = JSON.stringify(r.body?.error ?? r.body).slice(0, 200);
          if (/credit/i.test(why)) { r = await mz('POST', '/api/sales/orders', { ...body, override: true }, { status: true }); bump('creditOverrides'); }
          else throw new Error(`sales order refused for ${e.customer} on ${day}: ${why}`);
        }
        const so = await mz('GET', `/api/sales/orders/${r.body.id}`);
        S.sos.push({ id: r.body.id, number: so.number, customer: e.customer, channel: e.channel, currency: usd ? 'USD' : 'EGP',
          lines: e.lines.map((l, i) => ({ lineNo: i + 1, soLineId: so.lines?.[i]?.id, item: l.item, qty: l.qty, requested: l.requested, shipped: 0 })), ordered: day });
        bump('orders'); bump('orderUnits', e.lines.reduce((a, l) => a + l.qty, 0));
      }
    }
  }

  // ------------------------------------------------------------------ planner and buyer
  async function planning() {
    await pump();
    await gm('POST', '/api/pln/runs');
    await pump();
  }
  async function planner(day) {
    const ahead = book.policies.planner.release_days_ahead;
    const planned = (await gm('GET', '/api/pln/planned-orders?status=planned')).filter((p) => p.start_date <= addDays(day, ahead));
    let n = 0;
    for (const p of planned.sort((a, b) => (a.start_date < b.start_date ? -1 : 1))) {
      await gm('POST', `/api/pln/planned-orders/${p.id}/firm`);
      const pd = p.start_date < day ? day : p.start_date;
      const rel = await gm('POST', `/api/pln/planned-orders/${p.id}/release`, { commandId: cmd('rel'), productionDate: pd });
      const wo = rel.workOrder;
      const line = p.line ?? book.routings[p.item.code]?.lines[0];
      S.wos.set(wo.id, { id: wo.id, code: wo.code, item: p.item.code, line, planned: batch ? Number(p.qty) : Math.round(Number(p.qty)), plannedM: Math.round(Number(p.qty) * 1000), startedM: 0, doneM: 0, scrappedM: 0, started: 0, done: 0, scrapped: 0, prodDate: pd, due: p.due_date, closed: false });
      bump('released'); n++;
    }
    return n;
  }
  async function buyer(day) {
    await pump();
    const openReqs = (await mz('GET', '/api/purchase-requisitions')).filter((r) => r.status === 'open');
    S.openReqs = openReqs.length; S.firstOrderBy = openReqs.map((r) => r.order_by_date ?? r.need_date).sort()[0] ?? null;
    const reqs = openReqs.filter((r) => (r.order_by_date ?? r.need_date) <= addDays(day, book.policies.buyer.review_days));
    const groups = {};
    for (const r of reqs) {
      const code = codeOfMz[r.item_id];
      const sup = itemOf[code]?.supplier;
      if (!sup) continue;
      (groups[sup] ??= []).push(r);
    }
    let n = 0;
    for (const r of reqs) { const c = codeOfMz[r.item_id]; if (!itemOf[c]?.supplier) S.noSupplier[c ?? `item ${r.item_id}`] = (S.noSupplier[c ?? `item ${r.item_id}`] ?? 0) + 1; }
    if (process.env.BUYER_DEBUG) say(`    buyer ${day}: ${reqs.length} in window of ${openReqs.length} open: ${reqs.map((r) => codeOfMz[r.item_id]).join(',')}`);
    for (const [sup, rows] of Object.entries(groups)) {
      const s = suppOf[sup];
      const po = await mz('POST', '/api/purchase-requisitions/convert', { ids: rows.map((r) => r.id), supplierId: ids.supplier[sup], date: day, ...(s.currency === 'USD' ? { currency: 'USD' } : {}) });
      await mz('POST', `/api/purchase-orders/${po.id}/approve`);
      const late = RND('late', sup, day, po.id) < 0.15 ? 5 : 0;
      S.arrivals.push({ po: po.id, sup, on: addDays(day, Math.max(1, s.lead_days) + late), ordered: day });
      bump('po'); n++;
    }
    return n;
  }
  async function receiving(day) {
    const due = S.arrivals.filter((a) => a.on <= day);
    S.arrivals = S.arrivals.filter((a) => a.on > day);
    for (const a of due) {
      const po = await mz('GET', `/api/purchase-orders/${a.po}`);
      const lines = po.lines.map((l) => {
        const code = codeOfMz[l.item_id];
        const it = itemOf[code];
        return { code, l, body: { itemId: l.item_id, quantity: l.quantity, unitCost: l.unit_price, poLineId: l.id,
          ...(trackingOf(it) === 'batch' ? { lots: [{ lotNo: upper(`${code}-P${a.po}`).slice(0, 60), qty: l.base_quantity ?? l.quantity }] } : {}) } };
      });
      await mz('POST', '/api/inventory/receipts', { supplierId: po.supplier_id, poId: a.po, date: day, warehouseId: mainWh.id, post: true, ...(po.currency && po.currency !== 'EGP' ? { currency: po.currency, exchangeRate: po.exchange_rate ?? undefined } : {}),
        lines: lines.map((x) => x.body) });
      for (const x of lines) registerStock(x.code, x.l.base_quantity ?? x.l.quantity, upper(`${x.code}-P${a.po}`).slice(0, 60));
      bump('receipts');
    }
    if (due.length) { await pump(); await decideLots(); }
    return due.length;
  }

  // ------------------------------------------------------------------ production
  // A line's day is a list of shifts, each worth `factor` (heads present / heads needed, at most 1) of a full shift; a unit uses 1 / (units a full shift makes).
  const perShift = (item) => (item in book.capacity.per_shift ? book.capacity.per_shift[item] : Math.max(...Object.values(book.capacity.per_shift)) * 1.5);
  const lineToday = {};
  function lineState(line, day) {
    return (lineToday[line] ??= {
      parts: (book.capacity.shifts_on[line]?.find(([d]) => d === day)?.[1] ?? ['A', 'B']).map((shift) => ({ shift, cap: people ? people.crewPlan(line, shift, day).factor : 1 })),
      used: 0,
    });
  }
  function currentShift(ls) { let acc = 0; for (const p of ls.parts) { acc += p.cap; if (ls.used < acc - 1e-9) return p.shift; } return null; }
  const levels = {};
  const level = (code) => (levels[code] ??= 1 + Math.max(-1, ...(book.boms[code]?.lines ?? []).filter((l) => itemOf[l.component]?.procurement === 'make').map((l) => level(l.component))));
  const nextSerial = (code) => { const n = (S.serialN[code] = (S.serialN[code] ?? 0) + 1); return `${code.replace(/[^A-Z0-9]/g, '')}-${String(n).padStart(6, '0')}`; };
  async function unloadLoad(key) { const l = S.loads[key]; if (!l) return; await gm('POST', `/api/loads/${l.id}/unload`, { commandId: cmd('unl') }); delete S.loads[key]; }

  /** Makes sure every lot the unit needs is on its station and the other material is in stock. Returns false when material is short. */
  async function ready(w, lines) {
    for (const l of lines) {
      if (l.scan === 'lot') {
        const key = `${stationOf(w.line, l.op)}|${l.component}`;
        let cur = S.loads[key];
        if (!cur || cur.lot.rem < l.need) {
          const next = (S.lots[l.component] ?? []).find((x) => x.ok && x.rem >= l.need && x !== cur?.lot);
          if (!next) return { ok: false, why: l.component };
          await unloadLoad(key);
          const ld = await gm('POST', `/api/stations/${stationOf(w.line, l.op)}/loads`, { commandId: cmd('load'), itemId: g.gid[l.component], lotNo: next.lot, warehouseId: g.main.id });
          cur = S.loads[key] = { id: ld.id, lot: next };
        }
      } else if (l.scan === 'none') { if ((S.plain[l.component] ?? 0) < l.need) return { ok: false, why: l.component }; }
      else if (l.scan === 'serial') { if (!(S.semi[l.component]?.length)) return { ok: false, why: l.component }; }
    }
    return { ok: true };
  }
  const FAIL_RATE = { finished: 0.03, semi: 0.02 }, SCRAP_RATE = 0.004;

  async function runOrder(w, day) {
    const it = itemOf[w.item];
    const lines = bomOf(w.item);
    const plan = g.scanPlan[w.item];
    const ls = lineState(w.line, day);
    let made = 0;
    while (w.started < w.planned && currentShift(ls)) {
      const shift = currentShift(ls);
      const r = await ready(w, lines);
      if (!r.ok) { bump('shortages'); w.short = r.why; S.shortWhy[r.why] = (S.shortWhy[r.why] ?? 0) + 1; break; }
      const serial = nextSerial(w.item);
      // commit the material this unit takes
      for (const l of lines) {
        if (l.scan === 'none') S.plain[l.component] -= l.need;
        if (l.scan === 'lot') S.loads[`${stationOf(w.line, l.op)}|${l.component}`].lot.rem -= l.need;
      }
      const failAt = RND('fail', serial) < FAIL_RATE[it.type] ? plan[Math.max(0, plan.length - 2)] : null;
      const scrapAt = plan.length > 1 && RND('scrap', serial) < SCRAP_RATE ? plan[Math.floor((plan.length - 1) / 2)] : null;   // scrapped somewhere before the last operation
      w.started++; bump('unitsStarted');
      let scrapped = false;
      for (const op of plan) {
        const station = stationOf(w.line, op);
        const parts = lines.filter((l) => l.op === op && l.scan === 'serial').map((l) => ({ serial: S.semi[l.component].shift(), itemId: g.gid[l.component] }));
        const person = people?.personFor(w.line, shift, day, op);
        const base = { commandId: cmd('scan'), station, serial, ...(op === plan[0] ? { workOrderId: w.id } : {}), ...(parts.length ? { parts } : {}), ...(person ? { person, shift } : { shift }) };
        if (op === failAt) {
          await gm('POST', '/api/units/scan', { ...base, result: 'fail', defectCode: 'FUNC-FAIL' }); bump('scans'); bump('fails');
          await gm('POST', `/api/units/${serial}/repair`, { commandId: cmd('rep'), station, cause: 'COMPONENT', action: 'REPLACE', defectCode: 'FUNC-FAIL' }); bump('repairs');
          await gm('POST', '/api/units/scan', { ...base, commandId: cmd('scan'), parts: undefined }); bump('scans');
        } else {
          await gm('POST', '/api/units/scan', base); bump('scans');
        }
        if (op === scrapAt) {
          await gm('POST', `/api/units/${serial}/scrap`, { commandId: cmd('scrap'), station, reasonCode: 'SCRATCH' });
          scrapped = true; break;
        }
      }
      made++; ls.used += 1 / perShift(w.item);
      if (scrapped) { w.scrapped++; bump('scrapped'); }
      else {
        w.done++; S.counters.unitsDone[w.item] = (S.counters.unitsDone[w.item] ?? 0) + 1;
        (it.type === 'semi' ? (S.semi[w.item] ??= []) : (S.fin[w.item] ??= [])).push(serial);
      }
    }
    if (w.started === w.planned && w.done + w.scrapped === w.planned && !w.closed) {
      await gm('POST', `/api/work-orders/${w.id}/close`, { commandId: cmd('close') });
      w.closed = true;
    }
    return made;
  }
  /** Tiles: a work order is run in daily batches, in thousandths of a m2 (the quantities are not whole). The day's pressing takes the material it needs
   *  from the oldest released lots, reports the good m2 as one lot and the rest as scrap by reason. */
  async function runOrderBatch(w, day) {
    const bom = bomOf(w.item);
    const ls = lineState(w.line, day);
    const shifts = ls.parts.reduce((a, x) => a + x.cap, 0);
    const onHand = (code) => (S.lots[code] ?? []).filter((x) => x.ok).reduce((a, x) => a + x.rem, 0);
    let qty = Math.min(w.plannedM - w.startedM, Math.floor(Math.max(0, shifts - ls.used) * perShift(w.item) * 1000));
    if (qty <= 0) return 0;
    for (const l of bom) qty = Math.min(qty, Math.floor(onHand(l.component) * 1000 / l.need));    // l.need: thousandths of the component per m2
    if (qty < 1) { bump('shortages'); const why = bom.find((l) => onHand(l.component) < l.need / 1000)?.component ?? 'material'; w.short = why; S.shortWhy[why] = (S.shortWhy[why] ?? 0) + 1; return 0; }
    for (const l of bom) {                                   // take the material, oldest lot first, one consumption report per lot used
      let want = Math.round(qty * l.need / 1000);
      for (const lot of (S.lots[l.component] ?? []).filter((x) => x.ok && x.rem > 0)) {
        if (want <= 0) break;
        const take = Math.min(lot.rem, want);
        await gm('POST', `/api/work-orders/${w.id}/consume`, { commandId: cmd('use'), itemId: g.gid[l.component], qty: (take / U).toFixed(3), warehouseId: g.main.id, lotNo: lot.lot, station: stationOf(w.line, l.op), productionDate: day });
        lot.rem -= take; want -= take;
      }
    }
    const loss = book.production.loss[w.item] ?? 0.04;
    const lost = Math.min(qty, Math.round(qty * loss * (0.8 + 0.4 * RND('loss', w.code, day))));
    const good = qty - lost;
    const lotNo = `${book.production.lot_prefix?.[w.item] ?? w.item.slice(-3)}-${day.replace(/-/g, '')}-${++S.lotN}`;
    if (good > 0) {
      await gm('POST', `/api/work-orders/${w.id}/complete`, { commandId: cmd('out'), qty: (good / 1000).toFixed(3), lotNo, station: stationOf(w.line, 'SP'), productionDate: day });
      (S.finLots[w.item] ??= []).push({ lot: lotNo, rem: good });
    }
    let left = lost;
    const reasons = book.production.reasons;
    for (const [i, [reason, share]] of reasons.entries()) {
      const n = i === reasons.length - 1 ? left : Math.min(left, Math.round(lost * share));
      left -= n;
      if (n > 0) await gm('POST', `/api/work-orders/${w.id}/scrap`, { commandId: cmd('scr'), qty: (n / 1000).toFixed(3), reasonCode: reason, station: stationOf(w.line, reason === 'press-lamination' ? 'PR' : reason === 'kiln-crack' ? 'KL' : 'SP'), productionDate: day });
    }
    w.startedM += qty; w.doneM += good; w.scrappedM += lost; ls.used += qty / 1000 / perShift(w.item);
    w.started = w.startedM / 1000; w.done = w.doneM / 1000; w.scrapped = w.scrappedM / 1000;
    S.loss.pressed += qty / 1000; S.loss.good += good / 1000; S.loss.scrap += lost / 1000;
    S.counters.unitsDone[w.item] = (S.counters.unitsDone[w.item] ?? 0) + good / 1000; bump('unitsStarted', qty / 1000); bump('scrapped', lost / 1000);
    if (w.startedM === w.plannedM && w.doneM + w.scrappedM === w.plannedM && !w.closed) { await gm('POST', `/api/work-orders/${w.id}/close`, { commandId: cmd('close') }); w.closed = true; }
    return qty / 1000;
  }
  async function production(day) {
    for (const k of Object.keys(lineToday)) delete lineToday[k];
    let made = 0;
    if (batch) {
      for (const w of [...S.wos.values()].filter((x) => !x.closed && x.prodDate <= day).sort((a, b) => (a.prodDate < b.prodDate ? -1 : a.prodDate > b.prodDate ? 1 : a.code < b.code ? -1 : 1))) made += await runOrderBatch(w, day);
      if (made) await pump();                                // the lots reach Mizan's stock before anything is delivered from them
      return Math.round(made * 1000) / 1000;
    }
    // the parts of a unit are made before it: lowest level of the bill of materials first, then the oldest order
    const order = [...S.wos.values()].filter((w) => !w.closed && w.prodDate <= day)
      .sort((a, b) => (level(a.item) - level(b.item)) || (a.prodDate < b.prodDate ? -1 : a.prodDate > b.prodDate ? 1 : a.code < b.code ? -1 : 1));
    for (const w of order) made += await runOrder(w, day);
    return Math.round(made * 1000) / 1000;
  }

  // ------------------------------------------------------------------ shipping
  /** Tiles leave by lot: Mizan's delivery names the lots (the oldest first), then the invoice is posted; no pallets or containers. */
  async function shippingBatch(day) {
    let shipped = 0;
    const due = [];
    for (const so of S.sos) for (const l of so.lines) if (l.qty > l.shipped && addDays(l.requested, -1) <= day) due.push({ so, l });
    due.sort((a, b) => (a.l.requested < b.l.requested ? -1 : a.l.requested > b.l.requested ? 1 : a.so.number < b.so.number ? -1 : 1));
    const perOrder = new Map();
    for (const d of due) {
      const lots = S.finLots[d.l.item] ?? [];
      const have = lots.reduce((a, x) => a + x.rem, 0);
      const n = Math.min(Math.round(d.l.qty * U) - Math.round(d.l.shipped * U), have);   // thousandths of a m2
      if (n <= 0) continue;
      let want = n;
      const take = [];
      for (const lot of lots) { if (want <= 0) break; const q = Math.min(lot.rem, want); if (q > 0) { take.push({ lot, q }); lot.rem -= q; want -= q; } }
      S.finLots[d.l.item] = lots.filter((x) => x.rem > 0);
      (perOrder.get(d.so) ?? perOrder.set(d.so, []).get(d.so)).push({ l: d.l, n: n / U, take });
    }
    const deliveries = [];
    /** Gives back to the lots what a delivery cannot take (Mizan lets a sales delivery take only the stock that no other order has reserved). */
    const giveBack = (p, keep) => {
      let excess = p.take.reduce((a, x) => a + x.q, 0) - keep;
      for (let i = p.take.length - 1; i >= 0 && excess > 0; i--) {
        const back = Math.min(p.take[i].q, excess);
        p.take[i].q -= back; p.take[i].lot.rem += back; excess -= back;
        if (!(S.finLots[p.l.item] ?? []).includes(p.take[i].lot)) (S.finLots[p.l.item] ??= []).unshift(p.take[i].lot);
      }
      p.take = p.take.filter((x) => x.q > 0); p.n = p.take.reduce((a, x) => a + x.q, 0) / U;
    };
    for (const [so, picks] of perOrder) {
      const mk = (withLots) => mz('POST', '/api/sales/deliveries', { soId: so.id, date: day, reference: `${so.number}/${day}`, post: true,
        lines: picks.map((p) => ({ soLineId: p.l.soLineId, qty: p.take.reduce((a, x) => a + x.q, 0), warehouseId: mainWh.id, ...(withLots ? { lots: p.take.map((x) => ({ lotNo: x.lot.lot, qty: x.q })) } : {}) })) }, { allow: true, status: true });
      let del = null, withLots = true;
      for (let attempt = 0; attempt < 8 && picks.length; attempt++) {
        del = await mk(withLots);
        if (del.status < 400) break;
        const err = del.body?.error ?? {};
        if (err.code === 'sales.not_available') {             // other orders hold some of the stock: take what is free, ship the rest when its own order comes up
          const p = picks.find((x) => x.l.item === err.details?.sku);
          if (!p) break;
          giveBack(p, Math.max(0, Math.floor((err.details?.available ?? 0) * U)));
          if (p.n <= 0) picks.splice(picks.indexOf(p), 1);
          bump('partialDeliveries');
        } else if (withLots) { withLots = false; bump('deliveriesWithoutLot'); }    // Mizan did not keep the lot GMES reported: said plainly in the counters
        else break;
      }
      if (!picks.length) continue;
      if (del.status >= 400) throw new Error(`delivery refused for ${so.number} on ${day}: ${JSON.stringify(del.body?.error ?? del.body).slice(0, 300)}`);
      deliveries.push({ so, id: del.body.id, picks });
    }
    for (const d of deliveries) {
      const inv = await mz('POST', '/api/sales/invoices/from-deliveries', { deliveryIds: [d.id], date: day, post: false });
      await postInvoice(inv.id, day);               // a customer over the credit limit keeps a draft invoice: billing tries again each day, after payments came in
      for (const p of d.picks) {
        p.l.shipped += p.n; shipped += p.n; bump('shipped', p.n);
        if (day > p.l.requested) { bump('lateShipUnits', p.n); const late = diffDays(day, p.l.requested), bucket = late <= 2 ? '1-2' : late <= 7 ? '3-7' : late <= 14 ? '8-14' : '15+'; S.lateBy[`${d.so.channel} ${bucket} days`] = (S.lateBy[`${d.so.channel} ${bucket} days`] ?? 0) + p.n; }
      }
      bump('shipments');
    }
    return shipped;
  }
  async function shipping(day) {
    if (!S.sos.length) return 0;
    if (batch) return shippingBatch(day);
    let shipped = 0;
    const gmesSos = new Map((await gm('GET', '/api/sales-orders')).map((o) => [o.code, o]));
    const due = [];
    for (const so of S.sos) for (const l of so.lines) if (l.qty > l.shipped && addDays(l.requested, -1) <= day) due.push({ so, l });
    due.sort((a, b) => (a.l.requested < b.l.requested ? -1 : a.so.number < b.so.number ? -1 : 1));
    const perOrder = new Map();
    const taken = {};
    for (const d of due) {
      const avail = (S.fin[d.l.item]?.length ?? 0) - (taken[d.l.item] ?? 0);
      let n = Math.min(d.l.qty - d.l.shipped, avail);
      if (d.so.channel === 'export' && n < d.l.qty - d.l.shipped && d.l.requested > day) n = 0;   // a container leaves whole unless the order is already late
      if (n <= 0) continue;
      taken[d.l.item] = (taken[d.l.item] ?? 0) + n;
      (perOrder.get(d.so) ?? perOrder.set(d.so, []).get(d.so)).push({ l: d.l, n });
    }
    for (const [so, picks] of perOrder) {
      const gso = gmesSos.get(so.number);
      if (!gso) { for (const p of picks) taken[p.l.item] -= p.n; continue; }   // not mirrored yet: tomorrow
      const export_ = so.channel === 'export';
      const ctype = export_ ? '40HC' : 'TRUCK';
      // a shipping order lists each product once: two lines of one product (a mega order with several dates) go in separate shipping orders
      const rounds = [];
      for (const p of picks) { const r = rounds.find((x) => !x.some((y) => y.l.item === p.l.item)); if (r) r.push(p); else rounds.push([p]); }
      for (const round of rounds) {
      const ship = await gm('POST', '/api/shipping-orders/from-sales-order', { salesOrderId: gso.id, shipDate: day, containerType: ctype, lines: round.map((p) => ({ lineNo: p.l.lineNo, qty: p.n })) });
      for (const p of round) {
        const serials = S.fin[p.l.item].splice(0, p.n);
        const codes = [];
        for (const sn of serials) { const r = await gm('POST', '/api/pallets/pack', { commandId: cmd('pack'), serial: sn }); if (!codes.includes(r.pallet)) codes.push(r.pallet); }
        for (const pl of (await gm('GET', `/api/pallets?status=open&item=${p.l.item}`))) await gm('POST', `/api/pallets/${pl.code}/close`, { commandId: cmd('pclose') });
        const mine = (await gm('GET', `/api/pallets?status=closed&item=${p.l.item}`)).filter((x) => codes.includes(x.code));
        for (const pl of mine) await gm('POST', '/api/qms/inspections', { commandId: cmd('oqc'), planId: g.plans[p.l.item], targetType: 'pallet', target: pl.code });
        const pk = book.packing[p.l.item];
        const cap = Math.max(1, Math.floor((ctype === 'TRUCK' ? pk.per_truck : pk.per_40hc) / pk.per_pallet));
        for (let i = 0; i < mine.length; i += cap) {
          const number = export_ ? containerNo('NVEU', ++S.boxN) : `TRK-${String(++S.truckN).padStart(5, '0')}`;
          const cont = await gm('POST', `/api/shipping-orders/${ship.id}/containers`, { commandId: cmd('cont'), number, type: ctype });
          for (const pl of mine.slice(i, i + cap)) await gm('POST', `/api/containers/${cont.id}/load`, { commandId: cmd('ld'), pallet: pl.code });
          await gm('POST', `/api/containers/${cont.id}/dispatch`, { commandId: cmd('disp'), seal: `SEAL${String(++S.sealN).padStart(6, '0')}` });
          bump('containers');
        }
        p.l.shipped += p.n; shipped += p.n; bump('shipped', p.n);
        if (day > p.l.requested) {
          bump('lateShipUnits', p.n);
          const late = diffDays(day, p.l.requested), bucket = late <= 2 ? '1-2' : late <= 7 ? '3-7' : late <= 14 ? '8-14' : '15+';
          S.lateBy[`${so.channel} ${bucket} days`] = (S.lateBy[`${so.channel} ${bucket} days`] ?? 0) + p.n;
        }
      }
      bump('shipments');
      }
    }
    if (shipped) await pump();
    return shipped;
  }

  // ------------------------------------------------------------------ billing and cash
  /** A posted invoice becomes a receivable: the customer pays on their own days (the book gives each customer's mean delay). */
  async function registerReceivable(id, day) {
    const doc = await mz('GET', `/api/documents/${id}`);
    const cu = Object.entries(ids.customer).find(([, cid]) => cid === doc.party_id)?.[0];
    const c = custOf[cu] ?? { terms_days: 30, pay_delay_mean: 0 };
    const mean = c.pay_delay_mean ?? 0;
    const delay = Math.max(0, Math.round(mean + (RND('pay', doc.number) - 0.5) * mean * 0.6));
    S.receivables.push({ id, party: doc.party_id, total: doc.total, currency: doc.currency ?? 'EGP', on: addDays(doc.due_date ?? addDays(day, c.terms_days ?? 30), delay) });
    bump('invoices');
  }
  /** Posts a draft invoice. Mizan refuses it while the customer is over the credit limit: the invoice stays a draft (a credit hold) and is tried again the next day. */
  async function postInvoice(id, day) {
    const r = await mz('POST', `/api/documents/${id}/post`, undefined, { allow: true, status: true });
    if (r.status >= 400) {
      if (/credit_limit/.test(JSON.stringify(r.body))) { bump('creditHolds'); return false; }
      throw new Error(`invoice ${id} could not be posted on ${day}: ${JSON.stringify(r.body?.error ?? r.body).slice(0, 300)}`);
    }
    await registerReceivable(id, day);
    return true;
  }
  async function billing(day) {
    const docs = await mz('GET', '/api/documents?kind=sales_invoice');
    const rows = (docs.rows ?? docs).filter((d) => d.status === 'draft');
    for (const d of rows) await postInvoice(d.id, day);
    const dueNow = S.receivables.filter((r) => r.on <= day && isBank(day));
    S.receivables = S.receivables.filter((r) => !(r.on <= day && isBank(day)));
    for (const r of dueNow) {
      await mz('POST', '/api/payments', { direction: 'in', date: day, partyId: r.party, partyRole: 'customer', accountId: bank.id, amount: r.total, method: 'bank_transfer', ...(r.currency !== 'EGP' ? { currency: r.currency } : {}),
        allocations: [{ documentId: r.id, amount: r.total }], post: true });
      bump('payments');
    }
    return rows.length;
  }

  // ------------------------------------------------------------------ the days
  await openingStock();
  const eventsOn = {};
  for (const e of book.events) (eventsOn[e.date] ??= []).push(e);
  for (const day of dateList(from, to)) {
    const t0 = Date.now();
    const work = isWorkDay(day);
    tm(day, '07:05');
    if (hr) await hr('PUT', '/api/sim/today', { today: day });
    await demand(day, eventsOn[day] ?? []);
    const row = { day, work, orders: (eventsOn[day] ?? []).filter((e) => e.kind === 'sales_order').length };
    if (people && !work) { tm(day, '08:30'); await people.morning(day); if (people.payroll) await people.payroll(day); }   // HR's office works on the plant's rest days too: requisitions, candidates, training dates
    if (work) {
      tm(day, '07:15'); await planning();
      tm(day, '07:30'); row.released = await planner(day);
      tm(day, '07:45'); row.po = await buyer(day);
      tm(day, '08:00'); row.received = await receiving(day);
      if (people) { tm(day, '08:30'); await people.morning(day); }
      if (people?.payroll) { tm(day, '08:45'); await people.payroll(day); }
      tm(day, '09:00'); row.made = await production(day);
      tm(day, '16:00'); row.shipped = await shipping(day);
      tm(day, '17:00'); row.invoiced = await billing(day);
      if (people) { tm(day, '17:30'); await people.evening(day); }
    } else { tm(day, '17:00'); await billing(day); }
    row.seconds = Math.round((Date.now() - t0) / 100) / 10;
    S.daily.push(row);
    if (work) { row.openReqs = S.openReqs; row.firstOrderBy = S.firstOrderBy; }
    say(`  ${day}${work ? ' ' : '*'} orders ${row.orders} released ${row.released ?? '-'} po ${row.po ?? '-'} (open reqs ${row.openReqs ?? '-'}, first order-by ${row.firstOrderBy ?? '-'}) received ${row.received ?? '-'} made ${row.made ?? '-'} shipped ${row.shipped ?? '-'} invoiced ${row.invoiced ?? '-'}  (${row.seconds}s)`);
  }
  await pump();
  const open = S.sos.reduce((a, so) => a + so.lines.reduce((b, l) => b + (l.qty - l.shipped), 0), 0);
  log(true, 'the days are played', `${S.daily.length} days, ${S.counters.orders} orders, ${S.counters.shipped} units shipped, ${open} units still open (${S.sos.reduce((a, so) => a + so.lines.reduce((b, l) => b + (l.requested <= to ? l.qty - l.shipped : 0), 0), 0)} of them were due inside the window)`);
  // what is overdue at the end: lines whose requested day is inside the window and are not shipped (the rest is demand for after the window)
  const overdue = S.sos.reduce((a, so) => a + so.lines.reduce((b, l) => b + (l.requested <= to ? l.qty - l.shipped : 0), 0), 0);
  const due = S.sos.reduce((a, so) => a + so.lines.reduce((b, l) => b + (l.requested <= to ? l.qty : 0), 0), 0);
  const wos = [...S.wos.values()].map((w) => [w.code, w.item, w.line, w.planned, w.started, w.done, w.scrapped, w.closed ? 'closed' : 'open', w.short ?? '', w.prodDate, w.due]);
  return { counters: S.counters, daily: S.daily, openUnits: open, overdueUnits: overdue, dueUnits: due, lateBy: S.lateBy, shortWhy: S.shortWhy, wos, stock: { fin: Object.fromEntries(Object.entries(batch ? S.finLots : S.fin).map(([k, v]) => [k, batch ? Math.round(v.reduce((a, x) => a + x.rem, 0) / U) : v.length])), loss: S.loss, semi: Object.fromEntries(Object.entries(S.semi).map(([k, v]) => [k, v.length])) } };
}
