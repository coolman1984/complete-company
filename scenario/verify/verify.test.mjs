// The verifier must FAIL when the applications disagree (a check that cannot fail proves nothing). Fake applications, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMilli, verify } from './verify.mjs';

const COMPANY = '0192f7c4-8a3e-7b21-9c55-3d1f2a4b6c7d';

/** A pair of fake applications that agree; each test breaks one thing. */
function stack(over = {}) {
  const data = {
    company: { mizan: COMPANY, gmes: COMPANY },
    parked: { mizan: [], gmes: [] },
    peers: { mizan: [{ name: 'gmes', active: true, cursor: 5 }], gmes: [{ name: 'mizan', active: true, cursor: 9 }] },
    events: { mizan: [{ seq: 5 }], gmes: [{ seq: 9 }] },
    orders: [{ code: 'WO-1', completed_qty: '10' }],
    wip: [{ code: 'WO-1', status: 'closed', received_qty: 10000, issued_value: 500, received_value: 500 }],
    trial: { balanced: true, totals: { debit: 100, credit: 100 } },
    fg: [{ code: 'TV', loose: 2, open: 1, closed: 0, loaded: 0 }],
    items: [{ id: 7, sku: 'TV' }],
    levels: { 7: 3000 },
    reqs: [{ mrp_run: 'RUN-1' }],
    wos: [{ planned_order_id: 'PO-1' }],
    invoices: [{ id: 1, status: 'posted' }],
    ...over,
  };
  const mizan = async (_m, path) => {
    if (path === '/api/eco/company') return { companyId: data.company.mizan };
    if (path.startsWith('/api/integration/events?status=parked')) return data.parked.mizan;
    if (path === '/api/integration/events') return data.events.mizan;
    if (path === '/api/eco/peers') return data.peers.mizan;
    if (path.startsWith('/api/mfg/gmes-wip')) return data.wip;
    if (path.startsWith('/api/reports/trial-balance')) return data.trial;
    if (path === '/api/items') return data.items;
    if (path === '/api/inventory/levels') return data.levels;
    if (path === '/api/purchase-requisitions') return data.reqs;
    if (path.startsWith('/api/documents?kind=sales_invoice')) return { rows: data.invoices };
    throw new Error('unexpected ' + path);
  };
  const gmes = async (_m, path) => {
    if (path === '/api/health') return { company: data.company.gmes };
    if (path.startsWith('/api/integration/events?status=parked')) return data.parked.gmes;
    if (path === '/api/integration/events') return data.events.gmes;
    if (path === '/api/eco/peers') return data.peers.gmes;
    if (path === '/api/work-orders') return data.orders.map((o, i) => ({ ...o, ...(data.wos[i] ?? {}) }));
    if (path === '/api/fg-stock') return data.fg;
    if (path === '/api/pack-specs') return data.fg.length ? data.fg.map((f) => ({ code: f.code, per_pallet: 10 })) : data.specs ?? [];
    throw new Error('unexpected ' + path);
  };
  return { mizan, gmes };
}

const failing = (report) => report.checks.filter((c) => !c.ok).map((c) => c.name);

test('applications that agree pass every check', async () => {
  const report = await verify({ ...stack(), day: '2026-10-01' });
  assert.deepEqual(failing(report), []);
  assert.equal(report.ok, true);
  assert.ok(report.checks.length >= 8);
});

test('another company id in one application fails', async () => {
  const report = await verify({ ...stack({ company: { mizan: COMPANY, gmes: '0192f7c4-8a3e-7b21-9c55-000000000000' } }) });
  assert.deepEqual(failing(report), ['company id is the same in Mizan and GMES']);
});

test('a parked event on either side fails', async () => {
  assert.deepEqual(failing(await verify({ ...stack({ parked: { mizan: [], gmes: [{ type: 'x', consumer: 'mizan', code: 'sales.no_order' }] } }) })), ["nothing is parked in GMES's outbox"]);
  assert.deepEqual(failing(await verify({ ...stack({ parked: { mizan: [{ type: 'y' }], gmes: [] } }) })), ["nothing is parked in Mizan's outbox"]);
});

test('a peer that has not caught up, or no peer at all, means the outbox is not drained', async () => {
  const behind = await verify({ ...stack({ peers: { mizan: [{ name: 'gmes', active: true, cursor: 5 }], gmes: [{ name: 'mizan', active: true, cursor: 4 }] } }) });
  assert.deepEqual(failing(behind), ["GMES's outbox is drained"]);
  const none = await verify({ ...stack({ peers: { mizan: [], gmes: [{ name: 'mizan', active: true, cursor: 9 }] } }) });
  assert.deepEqual(failing(none), ["Mizan's outbox is drained"]);
});

test('a quantity that differs between GMES and Mizan names both numbers', async () => {
  const report = await verify({ ...stack({ wip: [{ code: 'WO-1', status: 'closed', received_qty: 9000, issued_value: 500, received_value: 500 }] }) });
  assert.deepEqual(failing(report), ['GMES completed = Mizan received, per work order']);
  assert.match(report.checks.find((c) => !c.ok).detail, /GMES completed 10, Mizan received 9/);
  const missing = await verify({ ...stack({ wip: [] }) });
  assert.match(missing.checks.find((c) => !c.ok).detail, /no work in progress record/);
});

test('work in progress left after a close, or an unbalanced trial balance, fails', async () => {
  assert.deepEqual(failing(await verify({ ...stack({ wip: [{ code: 'WO-1', status: 'closed', received_qty: 10000, issued_value: 500, received_value: 400 }] }) })), ['a closed work order leaves nothing in work in progress']);
  assert.deepEqual(failing(await verify({ ...stack({ trial: { balanced: false, totals: { debit: 100, credit: 90 } } }) })), ["Mizan's trial balance is balanced"]);
});

test('finished goods that differ between GMES and Mizan, negative stock, unsourced planning, a draft invoice and a missed service level all fail', async () => {
  const stock = await verify({ ...stack({ levels: { 7: 2000 } }) });
  assert.deepEqual(failing(stock), ["finished goods in GMES (not yet shipped) = Mizan's stock, per product"]);
  assert.match(stock.checks.find((c) => !c.ok).detail, /TV: GMES holds 3, Mizan 2/);
  assert.deepEqual(failing(await verify({ ...stack({ levels: { 7: 3000, 9: -1000 } }) })), ['no item has negative stock in Mizan']);
  assert.ok(failing(await verify({ ...stack({ reqs: [{}], wos: [{}] }) })).some((n) => /source run/.test(n)));
  assert.deepEqual(failing(await verify({ ...stack({ invoices: [{ id: 2, status: 'draft' }] }) })), ['every delivered sales order line is on an invoice that was posted (no draft left)']);
  assert.deepEqual(failing(await verify({ ...stack(), kpi: [{ name: 'on time', value: 40, range: [70, 100] }] })), ['on time']);
  assert.deepEqual(failing(await verify({ ...stack(), kpi: [{ name: 'on time', value: 90, range: [70, 100] }] })), []);
});

test('a plant that ships by lot (no pallet specifications) has no finished-goods stock to compare: that is not a difference', async () => {
  const report = await verify({ ...stack({ fg: [], specs: [], levels: {} }) });
  assert.deepEqual(failing(report), []);
  // but a product that does have a specification and differs still fails
  assert.deepEqual(failing(await verify({ ...stack({ fg: [{ code: 'TV', loose: 5, open: 0, closed: 0, loaded: 0 }], levels: { 7: 3000 } }) })), ["finished goods in GMES (not yet shipped) = Mizan's stock, per product"]);
});

test('nothing to compare is a failure, not a pass', async () => {
  const report = await verify({ ...stack({ orders: [], wip: [] }) });
  assert.ok(failing(report).includes('GMES completed = Mizan received, per work order'));
});

test('a call that fails is reported as a failed check, not skipped', async () => {
  const s = stack();
  const report = await verify({ mizan: s.mizan, gmes: async () => { throw new Error('GMES is down'); } });
  assert.equal(report.ok, false);
  assert.ok(report.checks.some((c) => !c.ok && /GMES is down/.test(c.detail)));
});

test('exact decimals: 3 places become integers, anything else is refused', () => {
  assert.equal(toMilli('12'), 12000);
  assert.equal(toMilli('10.5'), 10500);
  assert.equal(toMilli('0.001'), 1);
  assert.equal(toMilli('-2.25'), -2250);
  assert.equal(toMilli('0.0005'), null);
  assert.equal(toMilli('abc'), null);
  assert.equal(toMilli(undefined), null);
});
