// The package portal: one page listing the four applications with a health light each.
//   node portal/server.mjs [--port 4500] [--demo]
// Listens on 127.0.0.1 only. It asks each application's public health address from the server side (a browser page
// cannot read another port's answer), and never stores, forwards or proxies anything else. No dependencies.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const port = Number(arg('--port', process.env.PORTAL_PORT ?? 4500));
const demo = process.argv.includes('--demo');
const apps = JSON.parse(readFileSync(join(here, '..', 'apps.json'), 'utf8')).apps;
const page = readFileSync(join(here, 'index.html'));

async function probe(app) {
  const mode = demo ? app.demo : app.real;
  const url = `http://127.0.0.1:${mode.port}${app.health}`;
  const t0 = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return { ok: r.ok, status: r.status, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, detail: e?.name === 'TimeoutError' ? 'timeout' : 'not running' };
  }
}

async function status() {
  const results = await Promise.all(apps.map(probe));
  return {
    demo, checkedAt: new Date().toISOString(),
    apps: apps.map((a, i) => ({
      key: a.key, name: a.name, nameAr: a.nameAr, role: a.role, roleAr: a.roleAr,
      port: (demo ? a.demo : a.real).port, ...results[i],
    })),
  };
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname;
  if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(page);
  }
  if (req.method === 'GET' && path === '/api/status') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(await status()));
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Complete Company portal${demo ? ' (demo)' : ''}: http://127.0.0.1:${port}/`);
});
