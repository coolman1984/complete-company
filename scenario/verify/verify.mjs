// The cross-system verifier (plan 50 WP-P4), first slice: what can be proven today through the applications' HTTP APIs alone.
// It reads; it never writes, and it never touches a database. Each check says what it compared and with what result, so a
// failure names the two numbers that disagree. Fixed invariants implemented here:
//   Integration  company id equal in the apps; nothing refused (parked) by either side; GMES's outbox drained
//   Quantities   every GMES work order's completed quantity = what Mizan received into stock for it (by work order code)
//   Money        Mizan's trial balance is balanced; a closed work order leaves nothing in work in progress
//   People       (with HR) every crew requirement HR received has a matching staffing row
// Use:  import { verify } from './verify.mjs';  const report = await verify({ mizan, gmes, hr });   // calls as in chain/run.mjs
// or:   node verify.mjs   with CHAIN_INPUT as chain/run.mjs (a running stack) -> prints the report, exit code 1 on a failure.

const U = 1000;
const eq = (a, b) => a === b;

/** Decimal text from GMES ("12", "10.5", "0.001") to the exact integer ×1000 Mizan keeps; null when it cannot be exact. */
export function toMilli(text) {
  const m = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(String(text ?? '').trim());
  if (!m) return null;
  return (m[1] ? -1 : 1) * (Number(m[2]) * U + Number((m[3] ?? '').padEnd(3, '0') || 0));
}

export async function verify({ mizan, gmes, hr, day }) {
  const checks = [];
  const add = (area, name, ok, detail = '') => checks.push({ area, name, ok: !!ok, detail: ok ? '' : String(detail).slice(0, 500) });
  const safe = async (area, name, fn) => { try { await fn(); } catch (e) { add(area, name, false, `could not be checked: ${e.message}`); } };

  // ---- integration
  await safe('Integration', 'company id is the same in Mizan and GMES', async () => {
    const m = await mizan('GET', '/api/eco/company');
    const g = await gmes('GET', '/api/health');
    add('Integration', 'company id is the same in Mizan and GMES', eq(String(m.companyId).toLowerCase(), String(g.company).toLowerCase()), `Mizan ${m.companyId} vs GMES ${g.company}`);
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
      const peers = (await call('GET', '/api/eco/peers')).filter((p) => p.active);
      const behind = peers.filter((p) => p.cursor < newest);
      add('Integration', `${name}'s outbox is drained`, peers.length > 0 && behind.length === 0,
        peers.length === 0 ? 'no peer is configured' : behind.map((p) => `${p.name} is at ${p.cursor} of ${newest}${p.last_error ? ` (${p.last_error})` : ''}`).join('; '));
    });
  }

  // ---- quantities and work in progress
  await safe('Quantities', 'GMES completed = Mizan received, per work order', async () => {
    const orders = await gmes('GET', '/api/work-orders');
    const wip = await mizan('GET', '/api/mfg/gmes-wip');
    const byCode = new Map(wip.map((w) => [w.code, w]));
    const bad = [];
    let compared = 0;
    for (const o of orders) {
      const completed = toMilli(o.completed_qty);
      const w = byCode.get(o.code);
      if (completed === null) { bad.push(`${o.code}: quantity ${o.completed_qty} is not exact`); continue; }
      if (completed === 0 && !w) continue; // nothing was completed, so nothing to receive
      compared++;
      if (!w) bad.push(`${o.code}: GMES completed ${o.completed_qty}, Mizan has no work in progress record`);
      else if (w.received_qty !== completed) bad.push(`${o.code}: GMES completed ${completed / U}, Mizan received ${w.received_qty / U}`);
    }
    add('Quantities', 'GMES completed = Mizan received, per work order', bad.length === 0 && compared > 0, bad.length ? bad.join('; ') : 'no completed work order to compare');
    add('Money', 'a closed work order leaves nothing in work in progress', wip.filter((w) => w.status === 'closed').every((w) => w.issued_value === w.received_value),
      wip.filter((w) => w.status === 'closed' && w.issued_value !== w.received_value).map((w) => `${w.code}: issued ${w.issued_value}, received ${w.received_value}`).join('; '));
  });

  // ---- money
  await safe('Money', "Mizan's trial balance is balanced", async () => {
    const y = (day ?? new Date().toISOString().slice(0, 10)).slice(0, 4);
    const tb = await mizan('GET', `/api/reports/trial-balance?from=${y}-01-01&to=${y}-12-31`);
    add('Money', "Mizan's trial balance is balanced", tb.balanced === true && tb.totals.debit === tb.totals.credit, `debit ${tb.totals?.debit} vs credit ${tb.totals?.credit}`);
  });

  // ---- people
  if (hr) {
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
