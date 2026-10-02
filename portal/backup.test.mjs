// "Back up everything" must count a backup only when the application rehearsed it, and must say which application failed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { backupAll } from './backup.mjs';

/** A fake application: signs in with a cookie, and answers its backup route as told. */
async function fake(cookie, loginPath, backupPath, answer) {
  const calls = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      calls.push(`${req.method} ${req.url}`);
      const json = (status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };
      if (req.url === loginPath) return json(200, { ok: true }, { 'set-cookie': `${cookie}=abc; Path=/` });
      if (req.url === backupPath && req.method === 'POST') {
        if (!String(req.headers.cookie ?? '').includes(`${cookie}=abc`)) return json(401, { error: 'sign in' });
        const a = answer();
        return json(a.status ?? 200, a.body);
      }
      json(404, {});
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, calls, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) };
}

const logins = { mizan: { user: 'a', password: 'b' }, gmes: { user: 'a', password: 'b' }, hr: { user: 'a', password: 'b' } };

test('every application makes a backup that passed its rehearsal: ok, one result each, signed in first', async () => {
  const m = await fake('mizan_sid', '/api/auth/login', '/api/system/backups', () => ({ body: { name: 'mizan-1.db', rehearsal: { ok: true } } }));
  const g = await fake('gmes_sid', '/api/auth/login', '/api/system/backups', () => ({ body: { name: 'gmes-1.db', rehearsal: { ok: true } } }));
  const h = await fake('hr_sid', '/api/login', '/api/admin/backups', () => ({ body: { name: 'hr-1', rehearsal: { ok: true } } }));
  try {
    const r = await backupAll({ urls: { mizan: m.url, gmes: g.url, hr: h.url }, logins });
    assert.equal(r.ok, true);
    assert.deepEqual(r.results.map((x) => [x.key, x.ok, x.backup]), [['mizan', true, 'mizan-1.db'], ['gmes', true, 'gmes-1.db'], ['hr', true, 'hr-1']]);
    assert.deepEqual(m.calls, ['POST /api/auth/login', 'POST /api/system/backups']);
  } finally { await Promise.all([m.close(), g.close(), h.close()]); }
});

test('a backup whose rehearsal failed, or that reports none, is a failure that names the application', async () => {
  const m = await fake('mizan_sid', '/api/auth/login', '/api/system/backups', () => ({ body: { name: 'mizan-1.db', rehearsal: { ok: false, problems: ['1 posted journal entry does not balance'] } } }));
  const g = await fake('gmes_sid', '/api/auth/login', '/api/system/backups', () => ({ body: { name: 'gmes-1.db' } }));
  try {
    const r = await backupAll({ urls: { mizan: m.url, gmes: g.url }, logins });
    assert.equal(r.ok, false);
    assert.deepEqual(r.results.map((x) => [x.key, x.ok]), [['mizan', false], ['gmes', false]]);
    assert.match(r.results[0].detail, /does not balance/);
    assert.match(r.results[1].detail, /no rehearsal reported/);
  } finally { await Promise.all([m.close(), g.close()]); }
});

test('an application that is down or refuses the sign-in fails alone; the others are still backed up', async () => {
  const g = await fake('gmes_sid', '/api/auth/login', '/api/system/backups', () => ({ body: { name: 'gmes-1.db', rehearsal: { ok: true } } }));
  try {
    const r = await backupAll({ urls: { mizan: 'http://127.0.0.1:9', gmes: g.url }, logins });
    assert.equal(r.ok, false);
    assert.equal(r.results.find((x) => x.key === 'mizan').ok, false);
    assert.equal(r.results.find((x) => x.key === 'gmes').ok, true);
  } finally { await g.close(); }
});

test('a configured application without a login fails, and nothing at all is not a success', async () => {
  const g = await fake('gmes_sid', '/api/auth/login', '/api/system/backups', () => ({ body: { name: 'gmes-1.db', rehearsal: { ok: true } } }));
  try {
    const r = await backupAll({ urls: { gmes: g.url, hr: 'http://127.0.0.1:9' }, logins: { gmes: logins.gmes } });
    assert.deepEqual(r.results.map((x) => x.key), ['gmes', 'hr']);
    assert.equal(r.ok, false);
    assert.match(r.results[1].detail, /credentials/);
    assert.equal((await backupAll({ urls: {}, logins: {} })).ok, false);
  } finally { await g.close(); }
});

test('Space Planner participates without credentials and requires a passing rehearsal', async () => {
  const server = createServer((req, res) => {
    assert.equal(req.url, '/api/backups'); assert.equal(req.method, 'POST');
    res.writeHead(201, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ name: 'planner-snapshot.db', rehearsal: { ok: true } }));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const r = await backupAll({ urls: { space: `http://127.0.0.1:${server.address().port}` }, logins: {} });
    assert.equal(r.ok, true); assert.equal(r.results[0].key, 'space');
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
});
