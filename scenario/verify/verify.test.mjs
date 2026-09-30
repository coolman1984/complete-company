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
    ...over,
  };
  const mizan = async (_m, path) => {
    if (path === '/api/eco/company') return { companyId: data.company.mizan };
    if (path.startsWith('/api/integration/events?status=parked')) return data.parked.mizan;
    if (path === '/api/integration/events') return data.events.mizan;
    if (path === '/api/eco/peers') return data.peers.mizan;
    if (path === '/api/mfg/gmes-wip') return data.wip;
    if (path.startsWith('/api/reports/trial-balance')) return data.trial;
    throw new Error('unexpected ' + path);
  };
  const gmes = async (_m, path) => {
    if (path === '/api/health') return { company: data.company.gmes };
    if (path.startsWith('/api/integration/events?status=parked')) return data.parked.gmes;
    if (path === '/api/integration/events') return data.events.gmes;
    if (path === '/api/eco/peers') return data.peers.gmes;
    if (path === '/api/work-orders') return data.orders;
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
