// The scenario engine: hosts the applications, enters the book's master data, plays the days, saves what happened.
//   node --disable-warning=ExperimentalWarning --import tsx <this file> [--book electronics|ceramic] [--from D] [--to D] [--scale S] [--models A,B] [--out DIR] [--no-hr] [--setup-only]
// The working directory must be GMES/apps/mes-server (tsx is installed there); scripts/scenario.ps1 does that.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pair } from '../../portal/pair.mjs';
import { verify, printReport } from '../verify/verify.mjs';
import { backupAll } from '../../portal/backup.mjs';
import { buildBook } from './book.mjs';
import * as CERAMIC from '../gen/ceramic.mjs';
import { host, rootOf } from './host.mjs';
import { setupMizan, setupGmes } from './setup.mjs';
import { setupHr } from './hr.mjs';
import { play } from './sim.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const flag = (n) => process.argv.includes(n);
const here = dirname(fileURLToPath(import.meta.url));
const root = rootOf(here);
const bookName = arg('--book', 'electronics');
const ceramic = bookName === 'ceramic';
const book = ceramic ? CERAMIC.buildCeramicBook({ from: arg('--from'), to: arg('--to'), models: arg('--models')?.split(',') })
  : buildBook({ from: arg('--from'), to: arg('--to'), scale: arg('--scale') ? Number(arg('--scale')) : undefined, models: arg('--models')?.split(',') });
const out = resolve(arg('--out') ?? join(root, 'complete-company', 'scenario', 'out', ceramic ? 'demo-ceramics' : 'nile-vision'));
const withHr = !flag('--no-hr');
const started = Date.now();
const lines = [];
let failed = 0;
const log = (ok, what, detail = '') => { const l = `  ${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? '  ' + detail : ''}`; console.log(l); lines.push(l); if (!ok) failed++; };
const say = (t) => { console.log(t); lines.push(t); };

/** Pumps until both outboxes are fully taken by their peers (bounded), so a check never reads a half-delivered day. */
async function drain(pump, mz, gm) {
  for (let round = 0; round < 400; round++) {
    let behind = 0;
    for (const call of [mz, gm]) {
      const newest = (await call('GET', '/api/integration/events')).reduce((m, e) => Math.max(m, e.seq ?? 0), 0);
      behind += (await call('GET', '/api/eco/peers')).filter((p) => p.active && p.cursor < newest).length;
    }
    if (!behind) return round;
    await pump(1);
  }
  throw new Error('the applications never finished exchanging their events');
}

say(`${book.company.name} scenario ${book.meta.window.from}..${book.meta.window.to}, scale ${book.meta.scale}, models ${book.meta.models.join(',')}`);
const h = await host({ root, out, company: { name: book.company.name, code: book.company.code }, startDay: book.meta.window.from, hr: withHr });
let result = null;
// the marker that says this folder is DEMO data: the sign-in helper (scenario/ceramic/set-logins.*) refuses any folder without it, and the launcher needs the company id
writeFileSync(join(out, 'company.json'), JSON.stringify({ demo: true, company: h.company, name: book.company.name, code: book.company.code, window: book.meta.window, book: bookName, built: new Date().toISOString() }, null, 1));
try {
  const { mizan: mz, gmes: gm, hr } = h.clients;
  const pump = async (n = 3) => { for (let i = 0; i < n; i++) { await mz('POST', '/api/eco/sync'); await gm('POST', '/api/eco/push'); } };
  const ids = await setupMizan({ mz, book, log });
  const paired = await pair({ urls: h.urls, logins: h.logins });
  log(paired.ok, 'the applications are paired', paired.ok ? '' : JSON.stringify(paired.steps.filter((s) => !s.ok)));
  if (!paired.ok) throw new Error('pairing failed');
  await pump();
  const g = await setupGmes({ gm, book, log });
  const people = withHr ? await setupHr({ h, hr, gm, g, book, pump, log, model: ceramic ? CERAMIC : undefined }) : null;
  await pump();
  if (!flag('--setup-only')) {
    result = await play({ h, book, ids, g, people, pump, log, say });
    await drain(pump, mz, gm);   // everything each side has said has reached the other before anyone compares them
    if (people) result.people = { ...people.stats, refusedCount: people.refused.length, refused: people.refused.slice(0, 60), payrolls: people.payrolls };
    say('verify');
    const c = result.counters;
    const kpi = c.shipped > 0 ? [{ name: 'units shipped on or before the requested day are within the book\'s expected share (%)', value: Math.round(1000 * (1 - c.lateShipUnits / c.shipped)) / 10, range: book.kpi_expected.on_time_units_pct }] : [];
    if (result.dueUnits > 0) kpi.push({ name: 'units due inside the window were shipped by its end (%) (the plant may be short of material: see shortWhy)', value: Math.round(1000 * (1 - result.overdueUnits / result.dueUnits)) / 10, range: book.kpi_expected.fill_by_end_pct });
    const report = await verify({ mizan: mz, gmes: gm, hr, day: h.clock.day(), kpi, payrolls: people?.payrolls });
    for (const r of people?.payrolls ?? []) say(`  payroll ${r.period} run ${r.run}: ${r.headcount} people, gross ${(r.totals.gross_earnings + r.totals.overtime + r.totals.night_allowance) / 100}, tax ${r.totals.salary_tax / 100}, net ${r.totals.net_payable / 100} EGP, ${r.status}, accounting: ${r.delivery}`);
    printReport(report);
    failed += report.checks.filter((c) => !c.ok).length;
    if (!report.ok) {   // what each side refused, in full: the first thing to read when a check fails
      for (const [name, call] of [['GMES', gm], ['Mizan', mz]]) {
        const parked = await call('GET', '/api/integration/events?status=parked', undefined, { allow: true }).catch(() => []);
        const list = Array.isArray(parked) ? parked : [];
        const kinds = {};
        for (const p of list) { const k = `${p.type} ${p.code ?? ''} ${p.message ?? ''}`.slice(0, 200); kinds[k] = (kinds[k] ?? 0) + 1; }
        say(`  parked in ${name}: ${list.length}`);
        for (const [k, n] of Object.entries(kinds).slice(0, 12)) say(`    ${n} x ${k}`);
      }
    }
    const backups = await backupAll({ urls: h.urls, logins: h.logins });
    for (const b of backups.results) log(b.ok, `${b.name} backup`, b.ok ? b.backup : b.detail);
  }
} catch (e) {
  failed++;
  say(`STOPPED: ${e.stack ?? e.message}`);
} finally {
  const calls = Object.fromEntries(Object.entries(h.clients).filter(([, c]) => c).map(([k, c]) => [k, c.stats.calls]));
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'build.log'), lines.join('\n') + '\n');
  writeFileSync(join(out, 'manifest.json'), JSON.stringify({ window: book.meta.window, scale: book.meta.scale, models: book.meta.models, seconds: Math.round((Date.now() - started) / 1000), calls, failed, result }, null, 1));
  await h.stop();
}
say(failed ? `SCENARIO: ${failed} problem(s)` : 'SCENARIO: PASSED');
process.exit(failed ? 1 : 0);
