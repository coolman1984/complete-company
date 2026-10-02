import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { pair } from './pair.mjs';

async function app(kind, { parked = [], failUpdate = false } = {}) {
  const calls = [], keys = [], peers = [{ id: 1, name: kind === 'mizan' ? 'gmes' : 'mizan', active: true, cursor: 12, push_cursor: 12 }];
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    calls.push({ method: req.method, path: req.url, body });
    let result = {}, status = 200;
    if (req.url === '/api/eco/company') result = { companyId: 'company' };
    else if (req.url === '/api/health') result = { company: 'company' };
    else if (req.method === 'GET' && ['/api/keys', '/api/eco/keys'].includes(req.url)) result = keys;
    else if (req.method === 'POST' && ['/api/keys', '/api/eco/keys'].includes(req.url)) {
      if (keys.some(k => k.name === body.name)) { status = 409; result = { error: 'duplicate key' }; }
      else { keys.push({ id: keys.length + 1, name: body.name, active: true }); result = { key: `secret-${keys.length}` }; }
    } else if (req.url.endsWith('/revoke')) {
      const id = req.url.split('/').at(-2); const key = keys.find(k => kind === 'mizan' ? k.id === Number(id) : k.name === id); if (key) key.active = false;
    } else if (req.method === 'GET' && req.url === '/api/eco/peers') result = peers;
    else if (req.method === 'PUT' && req.url.startsWith('/api/eco/peers/')) { if (failUpdate) { status = 400; result = { error: 'refused update' }; } }
    else if (req.url === '/api/integration/events?status=parked') result = parked;
    else if (['/api/eco/sync', '/api/eco/push'].includes(req.url)) result = { peers: [{ peer: 'other', error: null }] };
    res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(result));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, calls, keys, peers, close: () => new Promise(r => { server.closeAllConnections(); server.close(r); }) };
}

async function run(options, action) {
  const m = await app('mizan', options), g = await app('gmes');
  const input = { urls: { mizan: m.url, gmes: g.url }, logins: { mizan: { user: 'a', password: 'b' }, gmes: { user: 'a', password: 'b' } } };
  try { await action(input, m, g); } finally { await Promise.all([m.close(), g.close()]); }
}

test('repeat pairing updates peers, preserves cursors, uses unique keys and retires old keys', async () => {
  await run({}, async (input, m, g) => {
    assert.equal((await pair(input)).ok, true);
    assert.equal((await pair(input)).ok, true);
    for (const a of [m, g]) {
      assert.equal(a.keys.length, 2); assert.equal(a.keys.filter(k => k.active).length, 1);
      assert.equal(a.calls.some(c => c.method === 'DELETE'), false);
      assert.equal(a.peers[0].cursor, 12);
      assert.equal(a.calls.filter(c => c.method === 'PUT').length, 2);
    }
  });
});

test('refused exchange cannot report successful pairing or retire previous keys', async () => {
  await run({ parked: [{ type: 'fact' }] }, async (input, m) => {
    const result = await pair(input);
    assert.equal(result.ok, false);
    assert.match(result.steps.find(s => !s.ok).detail, /refused event/);
    assert.equal(m.calls.some(c => c.path.endsWith('/revoke')), false);
  });
});

test('failed peer update does not delete the working connection', async () => {
  await run({ failUpdate: true }, async (input, m) => {
    assert.equal((await pair(input)).ok, false);
    assert.equal(m.peers.length, 1);
    assert.equal(m.calls.some(c => c.method === 'DELETE'), false);
  });
});
