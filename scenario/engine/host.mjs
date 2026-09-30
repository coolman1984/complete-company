// Hosts the applications for a scenario run (plan 50 WP-P3):
//   Mizan and GMES run INSIDE this process, each with its own real HTTP listener on a free loopback port and its own database
//   file under the output folder, both reading the one simulation clock; HR-System runs beside them as its own process started
//   with HR_SIMULATION=1 (its date is set through its own admin route).
// Everything after this file talks to the applications through their public HTTP APIs only. Start this process with the working
// directory `GMES/apps/mes-server` and `--import tsx` (GMES is TypeScript): scripts/scenario.ps1 does.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { client } from './client.mjs';
import { makeClock } from './clock.mjs';

const url = (p) => pathToFileURL(p).href;
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); s.on('error', rej); });
async function waitUp(u, seconds = 60) {
  const end = Date.now() + seconds * 1000;
  for (;;) {
    try { const r = await fetch(u, { signal: AbortSignal.timeout(3000) }); if (r.status < 500) return; } catch { /* not yet */ }
    if (Date.now() > end) throw new Error(`no answer from ${u} after ${seconds} s`);
    await new Promise((r) => setTimeout(r, 400));
  }
}
const postJson = async (base, path, body) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r;
};

/**
 * opts: { root (the folder holding the five repositories), out (fresh output folder), company: {name, code}, password, startDay,
 *         hr: boolean, plantTz }
 * Returns { urls, logins, company, clients: {mizan, gmes, hr}, clock, stop() }.
 */
export async function host(opts) {
  const { root, out, password = 'Demo-2026!', startDay, hr: withHr = true } = opts;
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const stops = [];

  // ---- Mizan (built JavaScript: the same files the installed program runs)
  process.env.MIZAN_SESSION_HOURS = '200000';   // a session is measured on the simulated clock, which jumps days at a time
  const mizanDir = join(root, 'Accounting-sys', 'apps', 'server', 'dist');
  const { buildApp: buildMizan } = await import(url(join(mizanDir, 'app.js')));
  const { loadConfig } = await import(url(join(mizanDir, 'config.js')));
  const clock = makeClock(startDay, '00:30');
  const mizan = await buildMizan(loadConfig({ dataDir: join(out, 'mizan'), dbFile: join(out, 'mizan', 'mizan.db'), logLevel: 'silent', webDir: null, host: '127.0.0.1', port: 0 }), undefined, { clock });
  await mizan.http.listen({ host: '127.0.0.1', port: 0 });
  const mizanUrl = `http://127.0.0.1:${mizan.http.server.address().port}`;
  stops.push(() => mizan.http.close());
  await postJson(mizanUrl, '/api/setup', { company: { name: opts.company.name, baseCurrency: 'EGP', moneyScale: 2 }, fiscalYearStart: `${startDay.slice(0, 4)}-01-01`,
    admin: { username: 'admin', displayName: 'Admin', password }, locale: 'en', seedChartOfAccounts: true, vatRateBp: 1400 });
  const mz = client(mizanUrl, 'mizan_sid', () => ['POST', '/api/auth/login', { username: 'admin', password }]);
  await mz('POST', '/api/auth/login', { username: 'admin', password });
  const company = (await mz('GET', '/api/eco/company')).companyId;

  // ---- GMES (TypeScript, loaded by tsx)
  process.env.GMES_SECRETS = 'plain';
  process.env.GMES_PLAN_LOOP = 'off';   // the engine runs planning itself, once a day
  const gmesSrc = join(root, 'GMES', 'apps', 'mes-server', 'src');
  const { buildApp: buildGmes } = await import(url(join(gmesSrc, 'app.ts')));
  const { systemClock } = await import(url(join(gmesSrc, 'kernel', 'clock.ts')));
  clock.newId = systemClock.newId;
  const gmes = await buildGmes({ dbFile: join(out, 'gmes', 'gmes.db'), backupDir: join(out, 'gmes', 'backups'), clock,
    config: { companyId: company, node: 'plant-1', timeZone: 'Africa/Cairo', productionDayStart: '07:00', ownership: { item: 'mizan', warehouse: 'mizan', person: withHr ? 'hr' : 'none' } } });
  await gmes.http.listen({ host: '127.0.0.1', port: 0 });
  const gmesUrl = `http://127.0.0.1:${gmes.http.server.address().port}`;
  stops.push(() => gmes.close());
  await postJson(gmesUrl, '/api/setup', { login: 'admin', name: 'Admin', password, language: 'en' });
  const gm = client(gmesUrl, 'gmes_sid', () => ['POST', '/api/auth/login', { login: 'admin', password }]);
  await gm('POST', '/api/auth/login', { login: 'admin', password });

  // ---- HR-System (Python, its own process, simulation switch on)
  let hrUrl = null, hrc = null, hrPassword = password;
  if (withHr) {
    const port = await freePort();
    const python = process.env.PYTHON || 'python';
    const hrDir = join(root, 'hr-system');
    const child = spawn(python, ['hr_main.py', '--port', String(port), '--background'], { cwd: hrDir, stdio: 'ignore', windowsHide: true,
      env: { ...process.env, HR_HOME: join(out, 'hr'), PYTHONPATH: join(hrDir, 'vendor.zip'), HR_SIMULATION: '1' } });
    stops.push(() => new Promise((res) => { child.once('exit', res); child.kill(); setTimeout(res, 3000); }));
    hrUrl = `http://127.0.0.1:${port}`;
    await waitUp(`${hrUrl}/api/info`, 90);
    await postJson(hrUrl, '/api/setup/install', { company: { source: 'owner', owner_app: 'mizan', id: company, code: opts.company.code, name: opts.company.name }, admin: { username: 'admin', display_name: 'Admin', password } });
    hrc = client(hrUrl, 'hr_sid', () => ['POST', '/api/login', { username: 'admin', password: hrPassword }]);
    await hrc('POST', '/api/login', { username: 'admin', password });
    try { await hrc('POST', '/api/password', { old: password, new: password + 'x' }); hrPassword = password + 'x'; await hrc('POST', '/api/password', { old: hrPassword, new: password }); hrPassword = password; } catch { /* first sign-in rule may differ */ }
    await hrc('PUT', '/api/sim/today', { today: startDay });
  }

  const logins = { mizan: { user: 'admin', password }, gmes: { user: 'admin', password }, ...(withHr ? { hr: { user: 'admin', password: hrPassword } } : {}) };
  return {
    urls: { mizan: mizanUrl, gmes: gmesUrl, hr: hrUrl }, logins, company, clock,
    clients: { mizan: mz, gmes: gm, hr: hrc },
    apps: { mizan, gmes },
    async stop() { for (const s of stops.reverse()) { try { await s(); } catch { /* already down */ } } },
  };
}

export const rootOf = (here) => resolve(here, '..', '..', '..');
