import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { checkReadiness } from './check.mjs';

const COMPANY = '0192f7c4-8a3e-7b21-9c55-3d1f2a4b6c7d';
const HR_CONNECTION = 'HR uses the accounting company and has healthy delivery connections';

// The real readiness entry point talks HTTP to a synthetic three-application stack.
// Non-integration business checks deliberately have no business records to compare.
async function stack(t, options = {}) {
  const calls = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const [app, ...parts] = url.pathname.slice(1).split('/');
    const path = '/' + parts.join('/');
    let body = '';
    for await (const chunk of req) body += chunk;
    const data = body ? JSON.parse(body) : null;
    calls.push({ app, path, data });
    const send = (status, payload) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (req.method === 'POST' && ['/api/login', '/api/auth/login'].includes(path)) {
      if (data.password === 'synthetic-secret') return send(200, { ok: true });
      if (app === (options.demoApp ?? 'hr') && options.demoResponse) {
        const response = options.demoResponse;
        if (response === 'network') return req.socket.destroy();
        if (response === 'malformed') {
          res.writeHead(200, { 'content-type': 'application/json' });
          return res.end('{invalid-json');
        }
        return send(response, { error: 'synthetic.failure', message: 'synthetic refusal' });
      }
      return send(401, { error: 'auth.failed', message: 'wrong user name or password' });
    }
    if (path === '/api/info') return send(200, { product: 'HR-System' });
    if (path === '/api/health') return send(200, { company: COMPANY });
    if (path === '/api/eco/company') return send(200, { companyId: COMPANY });
    if (path === '/api/integration/events') return send(200, url.searchParams.get('status') === 'parked' ? [] : [{ seq: 7 }]);
    if (path === '/api/eco/peers') return send(200, [{ name: app === 'mizan' ? 'gmes' : 'mizan', active: true, push: true, push_cursor: 7, cursor: 7 }]);
    if (path === '/api/admin/health') return send(200, { company: { id: options.hrCompany ?? COMPANY, provisional: options.provisional ?? false } });
    if (path === '/api/admin/eco-keys') return send(200, { keys: [], inbox: { received: 2, rejected: options.rejected ?? 0, unresolved_rejections: options.unresolved ?? options.rejected ?? 0, crew_rows: 0, last: null } });
    if (path === '/api/admin/integration') return send(200, { gmes_url: options.gmesUrl ?? `http://${req.headers.host}/gmes`, enabled: options.enabled ?? true, key_set: options.keySet ?? true, key_unreadable: options.keyUnreadable ?? false, outbox: options.outbox ?? { delivered: 7, pending: 0, rejected: 0 } });
    if (path === '/api/payroll/target') return send(200, { url: options.payrollUrl ?? `http://${req.headers.host}/mizan`, key_set: options.payrollKeySet ?? true });
    if (path.startsWith('/api/documents') || path.startsWith('/api/sales/deliveries')) return send(200, { rows: [], total: 0 });
    if (path === '/api/reports/trial-balance') return send(200, { balanced: true, totals: { debit: 0, credit: 0 } });
    if (path === '/api/inventory/levels') return send(200, {});
    if (path === '/api/overtime/policy') return send(200, { max_daily_minutes_incl_ot: 720 });
    return send(200, []);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const urls = Object.fromEntries(['mizan', 'gmes', 'hr'].map(app => [app, `${base}/${app}`]));
  const logins = Object.fromEntries(['mizan', 'gmes', 'hr'].map(app => [app, { user: 'admin', password: 'synthetic-secret' }]));
  if (options.missingHrLogin) delete logins.hr;
  const report = await checkReadiness({ urls, logins, demoLogins: [{ user: 'admin', password: 'synthetic-demo' }] });
  return { report, calls };
}

const failed = report => report.checks.filter(check => !check.ok);

test('genuine HTTP 401 refusals and matching healthy HR connections pass readiness', async t => {
  const { report, calls } = await stack(t);
  assert.equal(report.ok, true, JSON.stringify(failed(report)));
  assert.equal(report.checks.filter(check => check.area === 'Passwords').length, 3);
  assert.equal(report.checks.find(check => check.name === HR_CONNECTION)?.ok, true);
  assert.ok(calls.some(call => call.app === 'hr' && call.path === '/api/admin/health'));
});

for (const response of [500, 429, 423, 'malformed', 'network']) {
  test(`demo-password ${response} response cannot prove refusal`, async t => {
    const { report } = await stack(t, { demoResponse: response });
    assert.equal(report.ok, false);
    const passwordCheck = report.checks.find(check => check.name === 'HR-System refuses the demonstration passwords');
    assert.equal(passwordCheck?.ok, false);
    if (response !== 'malformed') assert.match(passwordCheck.detail, /could not prove refusal/);
  });
}

for (const [name, options] of [
  ['another company', { hrCompany: '0192f7c4-8a3e-7b21-9c55-000000000000' }],
  ['provisional identity', { provisional: true }],
  ['rejected incoming events', { rejected: 1 }],
  ['pending outgoing events', { outbox: { delivered: 7, pending: 1 } }],
  ['rejected outgoing events', { outbox: { delivered: 7, rejected: 1 } }],
  ['disabled connection', { enabled: false }],
  ['missing connection key', { keySet: false }],
  ['unreadable connection key', { keyUnreadable: true }],
  ['missing payroll key', { payrollKeySet: false }],
  ['missing payroll destination', { payrollUrl: '' }],
  ['wrong payroll destination', { payrollUrl: 'http://127.0.0.1:9' }],
  ['wrong manufacturing destination', { gmesUrl: 'http://127.0.0.1:9' }],
]) {
  test(`HR readiness fails for ${name}`, async t => {
    const { report } = await stack(t, options);
    assert.equal(report.ok, false);
    assert.deepEqual(failed(report).map(check => check.name), [HR_CONNECTION]);
  });
}

test('an HR URL without its administrator login cannot pass readiness', async t => {
  const { report, calls } = await stack(t, { missingHrLogin: true });
  assert.equal(report.ok, false);
  const connectionCheck = failed(report).find(check => check.area === 'Connections');
  assert.match(connectionCheck?.detail ?? '', /HR address was supplied without its administrator login/);
  assert.equal(calls.filter(call => call.app === 'hr' && call.data?.password === 'synthetic-secret').length, 0);
});

test('resolved historical rejections remain auditable without failing readiness', async t => {
  const { report } = await stack(t, { rejected: 1, unresolved: 0 });
  assert.equal(report.ok, true, JSON.stringify(failed(report)));
});
