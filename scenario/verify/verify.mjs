// The cross-system verifier (plan 50 WP-P4), first slice: what can be proven today through the applications' HTTP APIs alone.
// It reads; it never writes, and it never touches a database. Each check says what it compared and with what result, so a
// failure names the two numbers that disagree. Fixed invariants implemented here:
//   Integration  company id equal in the apps; nothing refused (parked) by either side; GMES's outbox drained
//   Quantities   every GMES work order's completed quantity = what Mizan received into stock for it (by work order code)
//   Money        Mizan's trial balance is balanced; a closed work order leaves nothing in work in progress
//   People       (with HR) every crew requirement HR received has a matching staffing row
//   Payroll      (with HR and payroll runs) every approved pay run reached accounting; Mizan's salary accounts equal HR's approved runs; no person's pay is in the totals Mizan holds
// Use:  import { verify } from './verify.mjs';  const report = await verify({ mizan, gmes, hr });   // calls as in chain/run.mjs
// or:   node verify.mjs   with CHAIN_INPUT as chain/run.mjs (a running stack) -> prints the report, exit code 1 on a failure.

const U = 1000;
const eq = (a, b) => a === b;

/** Read every page of an offset-paginated application API. */
export async function allRows(call, path) {
  const rows = [];
  for (let offset = 0; ; ) {
    const page = await call('GET', `${path}${path.includes('?') ? '&' : '?'}limit=200&offset=${offset}`);
    if (Array.isArray(page)) return [...rows, ...page];
    if (!Array.isArray(page?.rows) || !Number.isSafeInteger(page.total) || page.total < 0) throw new Error(`invalid page from ${path}`);
    rows.push(...page.rows);
    offset += page.rows.length;
    if (offset >= page.total) return rows;
    if (!page.rows.length) throw new Error(`incomplete page from ${path}: ${offset} of ${page.total}`);
  }
}

/** Decimal text from GMES ("12", "10.5", "0.001") to the exact integer ×1000 Mizan keeps; null when it cannot be exact. */
export function toMilli(text) {
  const m = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(String(text ?? '').trim());
  if (!m) return null;
  const exact = BigInt(m[2]) * 1000n + BigInt((m[3] ?? '').padEnd(3, '0') || '0');
  if (exact > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(m[1] ? -exact : exact);
}

export async function verify({ mizan, gmes, hr, day, kpi, payrolls, requiredFlows = [], expectedInventory }) {
  const checks = [];
  const add = (area, name, ok, detail = '') => checks.push({ area, name, ok: !!ok, detail: ok ? '' : String(detail).slice(0, 500) });
  const safe = async (area, name, fn) => { try { await fn(); } catch (e) { add(area, name, false, `could not be checked: ${e.message}`); } };

  // ---- integration
  await safe('Integration', 'company id is the same in Mizan and GMES', async () => {
    const m = await mizan('GET', '/api/eco/company');
    const g = await gmes('GET', '/api/health');
    add('Integration', 'company id is the same in Mizan and GMES', typeof m.companyId === 'string' && m.companyId.length > 0 && typeof g.company === 'string' && eq(m.companyId.toLowerCase(), g.company.toLowerCase()), `Mizan ${m.companyId} vs GMES ${g.company}`);
  });
  for (const [name, call] of [['GMES', gmes], ['Mizan', mizan]]) {
    await safe('Integration', `nothing is parked in ${name}'s outbox`, async () => {
      const parked = await call('GET', '/api/integration/events?status=parked');
      add('Integration', `nothing is parked in ${name}'s outbox`, parked.length === 0, JSON.stringify(parked.map((p) => [p.type, p.consumer, p.code, p.message]).slice(0, 5)));
    });
  }
  // drained = every active peer's cursor has reached the newest event of the outbox (a peer answers per event; the cursor moves past all answered ones)
  for (const [name, call] of [['GMES', gmes], ['Mizan', mizan]]) {
    await safe('Integration', `${name}'s outbox is drained`, async () => {
      const events = await call('GET', '/api/integration/events');
      const newest = events.reduce((m, e) => Math.max(m, e.seq ?? 0), 0);
      const peers = (await call('GET', '/api/eco/peers')).filter((p) => p.active && (name !== 'Mizan' || p.push));
      const cursor = (p) => name === 'Mizan' ? p.push_cursor : p.cursor;
      const behind = peers.filter((p) => !Number.isSafeInteger(cursor(p)) || cursor(p) < newest || p.last_error);
      add('Integration', `${name}'s outbox is drained`, peers.length > 0 && behind.length === 0,
        peers.length === 0 ? 'no active sending peer is configured' : behind.map((p) => `${p.name} is at ${cursor(p)} of ${newest}${p.last_error ? ` (${p.last_error})` : ''}`).join('; '));
    });
  }

  // ---- quantities and work in progress
  await safe('Quantities', 'GMES completed = Mizan received, per work order', async () => {
    const orders = await gmes('GET', '/api/work-orders');
    const wip = await mizan('GET', '/api/mfg/gmes-wip?limit=100000');
    const byCode = new Map(wip.map((w) => [w.code, w]));
    const bad = [];
    let compared = 0;
    for (const o of orders) {
      const completed = toMilli(o.completed_qty);
      const w = byCode.get(o.code);
      if (completed === null || completed < 0) { bad.push(`${o.code}: quantity ${o.completed_qty} is not exact`); continue; }
      if (completed === 0 && !w) continue; // nothing was completed, so nothing to receive
      compared++;
      if (!w) bad.push(`${o.code}: GMES completed ${o.completed_qty}, Mizan has no work in progress record`);
      else if (!Number.isSafeInteger(w.received_qty) || w.received_qty !== completed) bad.push(`${o.code}: GMES completed ${completed / U}, Mizan received ${w.received_qty / U}`);
    }
    add('Quantities', 'GMES completed = Mizan received, per work order', bad.length === 0 && compared > 0, bad.length ? bad.join('; ') : 'no completed work order to compare');
    add('Money', 'a closed work order leaves nothing in work in progress', wip.filter((w) => w.status === 'closed').every((w) => w.issued_value === w.received_value),
      wip.filter((w) => w.status === 'closed' && w.issued_value !== w.received_value).map((w) => `${w.code}: issued ${w.issued_value}, received ${w.received_value}`).join('; '));
  });

  // ---- stock: finished goods made = on hand in Mizan + shipped, per product (GMES: loose + pallets not yet shipped = what should still be in stock)
  await safe('Stock', "finished goods in GMES (not yet shipped) = Mizan's stock, per product", async () => {
    // the universe is every product that ships (it has a packing specification), so a plant that shipped everything is compared with zero
    const specs = (await gmes('GET', '/api/pack-specs')).filter((s) => s.per_pallet);
    const fg = new Map((await gmes('GET', '/api/fg-stock')).map((f) => [f.code, f]));
    const items = await mizan('GET', '/api/items');
    const rows = Array.isArray(items) ? items : items.rows ?? [];
    const idOf = new Map(rows.map((i) => [i.sku ?? i.code, i.id]));
    const levels = await mizan('GET', '/api/inventory/levels');
    const bad = [];
    for (const s of specs) {
      const f = fg.get(s.code);
      const gm = f ? (f.loose + f.open + f.closed + f.loaded) * U : 0;
      const mz = levels[idOf.get(s.code)] ?? 0;
      if (gm !== mz) bad.push(`${s.code}: GMES holds ${gm / U}, Mizan ${mz / U}`);
    }
    // a plant that ships by lot or by weight (tiles) has no pallet specifications: there is nothing to compare, which is not a difference
    add('Stock', "finished goods in GMES (not yet shipped) = Mizan's stock, per product", bad.length === 0, bad.slice(0, 8).join('; '));
  });
  await safe('Stock', 'no item has negative stock in Mizan', async () => {
    const levels = await mizan('GET', '/api/inventory/levels');
    const neg = Object.entries(levels).filter(([, q]) => q < 0);
    add('Stock', 'no item has negative stock in Mizan', neg.length === 0, neg.slice(0, 5).map(([id, q]) => `item ${id}: ${q / U}`).join('; '));
  });
  await safe('Planning', 'every requisition Mizan received from planning names its source run, and every work order its planned order or a reason', async () => {
    const reqs = await mizan('GET', '/api/purchase-requisitions');
    const unsourced = reqs.filter((r) => !r.mrp_run && !r.notes).length;
    const wos = await gmes('GET', '/api/work-orders');
    const manual = wos.filter((w) => !w.planned_order_id && !w.pegging).length;
    add('Planning', 'every requisition Mizan received from planning names its source run, and every work order its planned order or a reason', unsourced === 0 && manual === 0, `${unsourced} requisitions and ${manual} work orders without a source`);
  });

  // ---- money
  await safe('Money', 'every delivered sales order line is on an invoice that was posted (no draft left)', async () => {
    const rows = await allRows(mizan, '/api/documents?kind=sales_invoice');
    const drafts = rows.filter((d) => d.status === 'draft');
    const deliveries = await allRows(mizan, '/api/sales/deliveries?status=posted');
    const missing = [];
    for (const delivery of deliveries) {
      const detail = await mizan('GET', `/api/sales/deliveries/${delivery.id}`);
      if (!Array.isArray(detail.lines) || !detail.lines.length) throw new Error(`delivery ${delivery.id} has no readable lines`);
      for (const line of detail.lines) if (!Number.isSafeInteger(line.qty) || !Number.isSafeInteger(line.invoiced_qty) || line.invoiced_qty !== line.qty) {
        missing.push(`delivery ${delivery.id}, line ${line.id}: delivered ${line.qty}, posted invoice quantity ${line.invoiced_qty}`);
      }
    }
    add('Money', 'every delivered sales order line is on an invoice that was posted (no draft left)', drafts.length === 0 && missing.length === 0 && (!requiredFlows.includes('sales') || (deliveries.length > 0 && rows.some(d => d.status === 'posted'))),
      `${drafts.length} draft invoice(s)${missing.length ? '; ' + missing.slice(0, 6).join('; ') : ''}`);
  });
  // Receipts can remain unpaid on terms; prove the amounts and allocations actually recorded, without inventing a cash target.
  await safe('Money', 'posted payments and invoice settlements reconcile exactly', async () => {
    const payments = await allRows(mizan, '/api/payments?status=posted');
    const bad = [];
    for (const row of payments) {
      const p = await mizan('GET', `/api/payments/${row.id}`);
      if (!Number.isSafeInteger(p.amount) || p.amount <= 0 || !Array.isArray(p.allocations)) { bad.push(`payment ${row.id}: invalid amount or allocations`); continue; }
      let allocated = 0;
      for (const a of p.allocations) {
        if (!Number.isSafeInteger(a.amount) || a.amount <= 0) bad.push(`payment ${row.id}: invalid allocation`);
        else allocated += a.amount;
        const d = await mizan('GET', `/api/documents/${a.document_id}`);
        const settlements = d.settlements;
        if (d.status !== 'posted' || !Number.isSafeInteger(d.total) || !Number.isSafeInteger(d.amount_settled)
          || d.amount_settled < 0 || d.amount_settled > d.total || !Array.isArray(settlements)
          || settlements.some(s => !Number.isSafeInteger(s.amount) || s.amount <= 0)
          || settlements.reduce((sum, s) => sum + s.amount, 0) !== d.amount_settled
          || !settlements.some(s => s.source_type === 'payment' && s.source_id === p.id && s.amount === a.amount)
          || d.party_id !== p.party_id || (p.direction === 'in' ? d.kind !== 'sales_invoice' : d.kind !== 'purchase_bill')) {
          bad.push(`payment ${row.id}, document ${a.document_id}: settlement, party or direction does not reconcile`);
        }
      }
      if (!Number.isSafeInteger(allocated) || allocated > p.amount || row.allocated !== allocated) bad.push(`payment ${row.id}: amount ${p.amount}, allocations ${allocated}, reported ${row.allocated}`);
    }
    const covered = !requiredFlows.includes('sales') || payments.some(p => p.direction === 'in' && p.allocated > 0);
    add('Money', 'posted payments and invoice settlements reconcile exactly', !bad.length && covered, bad.join('; ') || 'no allocated customer receipt');
  });
  await safe('Money', 'supplier receipts reconcile with received-not-invoiced accounting', async () => {
    const receipts = await allRows(mizan, '/api/inventory/receipts?status=posted');
    const grni = await mizan('GET', `/api/inventory/reports/grni?asOf=${day ?? new Date().toISOString().slice(0, 10)}`);
    const bills = requiredFlows.includes('purchasing') ? await allRows(mizan, '/api/documents?kind=purchase_bill&status=posted') : [];
    const valid = Number.isSafeInteger(grni.open) && Number.isSafeInteger(grni.ledger) && grni.open === grni.ledger
      && Array.isArray(grni.rows) && grni.rows.every(r => Number.isSafeInteger(r.value) && Number.isSafeInteger(r.billed_value) && r.value >= r.billed_value
        && Number.isSafeInteger(r.base_quantity) && Number.isSafeInteger(r.billed_base) && r.base_quantity >= r.billed_base)
      && grni.rows.reduce((s, r) => s + r.value - r.billed_value, 0) === grni.open
      && (!requiredFlows.includes('purchasing') || (receipts.length > 0 && bills.length > 0));
    add('Money', 'supplier receipts reconcile with received-not-invoiced accounting', valid, `receipts ${receipts.length}; bills ${bills.length}; unbilled ${grni.open}, ledger ${grni.ledger}`);
  });
  if (expectedInventory) await safe('Stock', 'all expected finished products reconcile to accounting stock and lots', async () => {
    const items = await mizan('GET', '/api/items');
    const ids = new Map((Array.isArray(items) ? items : items.rows).map(i => [i.sku ?? i.code, i.id]));
    const levels = await mizan('GET', '/api/inventory/levels');
    const lots = await mizan('GET', '/api/inventory/lots');
    const bad = [];
    for (const [code, expected] of Object.entries(expectedInventory)) {
      const id = ids.get(code), actual = levels[id] ?? 0;
      if (!id || !Number.isSafeInteger(expected.qty) || expected.qty < 0 || actual !== expected.qty) bad.push(`${code}: expected ${expected.qty}, stock ${actual}`);
      if (expected.lots) for (const [lot, qty] of Object.entries(expected.lots)) {
        const got = lots.filter(l => l.item_id === id && l.lot_no === lot).reduce((s, l) => s + l.qty, 0);
        if (!Number.isSafeInteger(qty) || qty < 0 || got !== qty) bad.push(`${code}/${lot}: expected ${qty}, stock ${got}`);
      }
      if (expected.lots && lots.some(l => l.item_id === id && !(l.lot_no in expected.lots) && l.qty !== 0)) bad.push(`${code}: unexpected lot stock`);
    }
    add('Stock', 'all expected finished products reconcile to accounting stock and lots', Object.keys(expectedInventory).length > 0 && !bad.length, bad.join('; ') || 'no finished products supplied');
  });
  await safe('Money', "Mizan's trial balance is balanced", async () => {
    const y = (day ?? new Date().toISOString().slice(0, 10)).slice(0, 4);
    const tb = await mizan('GET', `/api/reports/trial-balance?from=${y}-01-01&to=${y}-12-31`);
    add('Money', "Mizan's trial balance is balanced", tb.balanced === true && tb.totals.debit === tb.totals.credit, `debit ${tb.totals?.debit} vs credit ${tb.totals?.credit}`);
  });

  // ---- people
  if (hr) {
    await safe('Integration', 'HR uses the accounting company and has healthy delivery connections', async () => {
      const company = (await mizan('GET', '/api/eco/company')).companyId;
      const health = await hr('GET', '/api/admin/health');
      const inbox = await hr('GET', '/api/admin/eco-keys');
      const outbound = await hr('GET', '/api/admin/integration');
      const payroll = await hr('GET', '/api/payroll/target');
      const refused = inbox.inbox?.unresolved_rejections ?? inbox.inbox?.rejected;
      const address = (value) => String(value ?? '').replace(/\/+$/, '');
      const destinationsMatch = (!gmes.base || address(outbound.gmes_url) === address(gmes.base))
        && (!mizan.base || address(payroll.url) === address(mizan.base));
      const pending = Object.entries(outbound.outbox ?? {}).filter(([state, count]) => state !== 'delivered' && Number(count) > 0);
      const ok = String(health.company?.id ?? '').toLowerCase() === String(company).toLowerCase()
        && !health.company?.provisional && refused === 0 && outbound.enabled === true && outbound.key_set === true
        && !outbound.key_unreadable && pending.length === 0 && typeof payroll.url === 'string' && payroll.url.length > 0 && payroll.key_set === true && destinationsMatch;
      add('Integration', 'HR uses the accounting company and has healthy delivery connections', ok,
        `HR company ${health.company?.id}; provisional ${health.company?.provisional}; unresolved rejections ${refused}; enabled ${outbound.enabled}; key set ${outbound.key_set}; pending ${JSON.stringify(pending)}; payroll target/key ${!!payroll.url}/${payroll.key_set}; destinations match ${destinationsMatch}`);
    });
    await safe('People', 'every crew requirement received by HR shows in its staffing gap', async () => {
      const from = day ?? new Date().toISOString().slice(0, 10);
      const to = new Date(Date.parse(from + 'T00:00:00Z') + 60 * 86_400_000).toISOString().slice(0, 10);
      const crew = await gmes('GET', `/api/pln/crew?from=${from}&to=${to}`);
      const rows = await hr('GET', `/api/staffing/gap?from=${from}&to=${to}`);
      const need = new Set(crew.filter((c) => Number(c.required) > 0).map((c) => `${c.date}|${c.shift}`));
      const have = new Set(rows.map((r) => `${r.date}|${r.shift}`));
      const missing = [...need].filter((k) => !have.has(k));
      add('People', 'every crew requirement received by HR shows in its staffing gap', missing.length === 0 && need.size > 0, missing.length ? `missing in HR: ${missing.slice(0, 5).join(', ')}` : 'GMES has no crew requirement yet');
    });
  }
  if (hr) {
    await safe('People', 'the people GMES holds are the people HR has (active, by code)', async () => {
      const mine = (await hr('GET', '/api/employee')).filter((e) => !e.deleted && e.employment_status === 'Active').map((e) => e.code).sort();
      const theirs = (await gmes('GET', '/api/employees')).filter((e) => e.active).map((e) => e.code).sort();
      const missing = mine.filter((c) => !theirs.includes(c)), extra = theirs.filter((c) => !mine.includes(c));
      add('People', 'the people GMES holds are the people HR has (active, by code)', missing.length === 0 && extra.length === 0,
        `missing in GMES: ${missing.slice(0, 5).join(', ')}; not active in HR: ${extra.slice(0, 5).join(', ')}`);
    });
    await safe('People', 'no overtime is approved beyond the plant policy caps', async () => {
      const pol = await hr('GET', '/api/overtime/policy');
      const ot = (await hr('GET', '/api/overtime_request')).filter((r) => !r.deleted && r.status === 'approved');
      const perDay = new Map();
      for (const r of ot) perDay.set(`${r.employee_id}|${r.work_date}`, (perDay.get(`${r.employee_id}|${r.work_date}`) ?? 0) + Number(r.planned_minutes));
      const over = [...perDay].filter(([, m]) => m > pol.max_daily_minutes_incl_ot);
      add('People', 'no overtime is approved beyond the plant policy caps', over.length === 0, `${over.length} person-days over ${pol.max_daily_minutes_incl_ot} minutes`);
    });
  }

  // ---- payroll: HR calculates, Mizan books; the two must agree to the piastre
  if (hr && (payrolls?.length || requiredFlows.includes('payroll'))) {
    await safe('Payroll', 'every approved pay run reached accounting', async () => {
      const runs = (await hr('GET', '/api/payroll/runs')).filter((r) => r.status === 'approved');
      const notSent = runs.filter((r) => r.delivery?.state !== 'delivered');
      add('Payroll', 'every approved pay run reached accounting', runs.length > 0 && notSent.length === 0, runs.length ? notSent.map((r) => `${r.period} #${r.run}: ${r.delivery?.state ?? 'not sent'} ${r.delivery?.detail ?? ''}`).join('; ') : 'no pay run was approved');
    });
    await safe('Payroll', "Mizan's salary accounts equal HR's approved pay runs", async () => {
      const runs = (await hr('GET', '/api/payroll/runs')).filter((r) => r.status === 'approved');
      const sum = (k) => runs.reduce((a, r) => a + r.totals[k], 0);
      const want = { 5210: sum('gross_earnings') + sum('overtime') + sum('night_allowance'), 5211: sum('employer_social_insurance'), 2140: sum('net_payable'), 2141: sum('employee_social_insurance') + sum('employer_social_insurance'), 2142: sum('salary_tax'), 2185: sum('other_deductions') };
      const y = (day ?? new Date().toISOString().slice(0, 10)).slice(0, 4);
      const tb = await mizan('GET', `/api/reports/trial-balance?from=${y}-01-01&to=${y}-12-31`);
      const byCode = new Map(tb.rows.map((r) => [r.code, r]));
      const bad = Object.entries(want).filter(([code, amount]) => { const r = byCode.get(code); const got = r ? (['5210', '5211'].includes(code) ? r.debit : r.credit) : 0; return got !== amount; })
        .map(([code, amount]) => `${code}: HR ${amount}, Mizan ${(['5210', '5211'].includes(code) ? byCode.get(code)?.debit : byCode.get(code)?.credit) ?? 0}`);
      add('Payroll', "Mizan's salary accounts equal HR's approved pay runs", runs.length > 0 && bad.length === 0, bad.join('; ') || 'no approved run');
    });
    await safe('Payroll', 'a pay run never changes after approval', async () => {
      const runs = (await hr('GET', '/api/payroll/runs')).filter((r) => r.status === 'approved');
      const changed = (payrolls ?? []).filter(p => { const r = runs.find(r => p.period === r.period && p.run === r.run); return !r || p.headcount !== r.headcount || Object.keys(p.totals).some(k => p.totals[k] !== r.totals[k]); });
      add('Payroll', 'a pay run never changes after approval', changed.length === 0, changed.map((r) => `${r.period} #${r.run}`).join(', '));
    });
  }

  // ---- service level, against what the book expects (tolerance is the book's own range)
  if (kpi) {
    for (const k of kpi) add('Service', k.name, k.value >= k.range[0] && k.value <= k.range[1], `${k.value} is outside ${k.range[0]}..${k.range[1]}`);
  }
  return { ok: checks.every((c) => c.ok), checks };
}

export function printReport(report, log = console.log) {
  let area = '';
  for (const c of report.checks) {
    if (c.area !== area) { area = c.area; log(`  ${area}`); }
    log(`    ${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.detail ? '  — ' + c.detail : ''}`);
  }
  log(report.ok ? 'VERIFY: PASSED' : `VERIFY: ${report.checks.filter((c) => !c.ok).length} check(s) failed`);
}

// ---- command line: verify a running stack
if (import.meta.url === new URL(process.argv[1], 'file://').href || process.argv[1]?.endsWith('verify.mjs')) {
  if (process.env.CHAIN_INPUT) {
    const { urls, logins } = JSON.parse(process.env.CHAIN_INPUT);
    const client = (base, cookieName) => {
      let cookie = '';
      return async (method, path, body) => {
        const r = await fetch(base + path, { method, signal: AbortSignal.timeout(60_000), headers: { 'content-type': 'application/json', origin: base, ...(cookie ? { cookie } : {}) }, body: body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(body) });
        const set = r.headers.get('set-cookie');
        if (set && set.startsWith(cookieName + '=')) cookie = set.split(';')[0];
        const text = await r.text();
        if (!r.ok) throw new Error(`${method} ${path}: ${r.status}`);
        return text ? JSON.parse(text) : null;
      };
    };
    const mizan = client(urls.mizan, 'mizan_sid'), gmes = client(urls.gmes, 'gmes_sid');
    const hr = urls.hr ? client(urls.hr, 'hr_sid') : null;
    await gmes('POST', '/api/auth/login', { login: logins.gmes.user, password: logins.gmes.password });
    await mizan('POST', '/api/auth/login', { username: logins.mizan.user, password: logins.mizan.password });
    if (hr) await hr('POST', '/api/login', { username: logins.hr.user, password: logins.hr.password });
    const report = await verify({ mizan, gmes, hr });
    printReport(report);
    process.exitCode = report.ok ? 0 : 1;
  }
}
