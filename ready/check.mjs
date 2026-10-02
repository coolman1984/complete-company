// Is this installation ready for real data? Reads, never changes (except the optional backup).
//   node ready/check.mjs --mizan URL --gmes URL [--hr URL] --user admin --password ...   [--hr-user ... --hr-password ...] [--backup]
// Checks: every application answers; none still accepts a known demonstration password (one try each, then it stops);
// both applications run under the same company id and are paired, nothing refused (parked), nothing waiting in an outbox;
// with --backup, every application makes a backup and passes its own rehearsal.
import { pathToFileURL } from 'node:url';
import { session, HttpError } from '../portal/pair.mjs';
import { backupAll } from '../portal/backup.mjs';
import { client } from '../scenario/engine/client.mjs';
import { verify } from '../scenario/verify/verify.mjs';

/** The credentials the demonstrations ship with. A real installation must not accept any of them. */
export const DEMO_LOGINS = [{ user: 'admin', password: '123' }, { user: 'admin', password: 'Demo-2026!' }];

const APPS = [
  { key: 'mizan', name: 'Mizan', health: '/api/health', cookie: 'mizan_sid', login: (l) => ['POST', '/api/auth/login', { username: l.user, password: l.password }] },
  { key: 'gmes', name: 'Itqan', health: '/api/health', cookie: 'gmes_sid', login: (l) => ['POST', '/api/auth/login', { login: l.user, password: l.password }] },
  { key: 'hr', name: 'HR-System', health: '/api/info', cookie: 'hr_sid', login: (l) => ['POST', '/api/login', { username: l.user, password: l.password }] },
  { key: 'space', name: 'Space Planner', health: '/api/health', login: null },
];

export async function checkReadiness({ urls, logins, backup = false, demoLogins = DEMO_LOGINS }) {
  const checks = [];
  const add = (area, name, ok, detail = '') => checks.push({ area, name, ok: !!ok, detail: ok ? '' : String(detail).slice(0, 400) });
  const present = APPS.filter((a) => urls[a.key]);

  for (const a of present) {
    try {
      const r = await fetch(urls[a.key] + a.health, { signal: AbortSignal.timeout(5000) });
      add('Running', `${a.name} answers`, r.ok, `HTTP ${r.status}`);
    } catch (e) { add('Running', `${a.name} answers`, false, `not reachable at ${urls[a.key]}: ${e.message}`); }
  }
  if (checks.some((c) => !c.ok)) return { ok: false, checks };

  // a demonstration password still working means anyone who has seen a demo can sign in
  for (const a of present.filter(a => a.login)) {
    let accepted = null, uncertain = null;
    for (const d of demoLogins) {
      const call = session(urls[a.key], a.cookie, 15_000);
      const [m, p, b] = a.login(d);
      try { await call(m, p, b); accepted = d; break; }
      catch (e) { if (!(e instanceof HttpError) || e.status !== 401) { uncertain = e.message; break; } }
    }
    add('Passwords', `${a.name} refuses the demonstration passwords`, accepted === null && uncertain === null, accepted ? `${a.name} accepts ${accepted.user} / ${accepted.password}: change it before real data goes in` : uncertain ? `could not prove refusal: ${uncertain}` : '');
  }

  // the connections between the applications
  if (urls.mizan && urls.gmes && logins?.mizan && logins?.gmes) {
    try {
      const mz = client(urls.mizan, 'mizan_sid', () => APPS[0].login(logins.mizan));
      const gm = client(urls.gmes, 'gmes_sid', () => APPS[1].login(logins.gmes));
      await mz(...APPS[0].login(logins.mizan));
      await gm(...APPS[1].login(logins.gmes));
      let hr = null;
      if (urls.hr && logins?.hr) { hr = client(urls.hr, 'hr_sid', () => APPS[2].login(logins.hr)); await hr(...APPS[2].login(logins.hr)); }
      if (urls.hr && !hr) throw new Error('HR address was supplied without its administrator login');
      const report = await verify({ mizan: mz, gmes: gm, hr });
      for (const c of report.checks.filter((x) => x.area === 'Integration')) add('Connections', c.name, c.ok, c.detail);
    } catch (e) { add('Connections', 'the applications can be asked about their connections', false, e.message); }
  } else add('Connections', 'the applications can be asked about their connections', false, 'give --user and --password (and the Itqan login) so the check can sign in');

  if (backup) {
    const done = await backupAll({ urls, logins });
    for (const r of done.results) add('Backup', `${r.name} makes a backup that passes its own rehearsal`, r.ok, r.detail);
  }
  return { ok: checks.every((c) => c.ok), checks };
}

export function printReadiness(report, log = console.log) {
  let area = '';
  for (const c of report.checks) {
    if (c.area !== area) { area = c.area; log(`  ${area}`); }
    log(`    ${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.detail ? '  - ' + c.detail : ''}`);
  }
  log(report.ok ? 'READY: every check passed.' : `NOT READY: ${report.checks.filter((c) => !c.ok).length} check(s) failed.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
  const user = arg('--user', process.env.READY_USER), password = arg('--password', process.env.READY_PASSWORD);
  const urls = { mizan: arg('--mizan'), gmes: arg('--gmes'), hr: arg('--hr'), space: arg('--space') };
  const logins = {
    mizan: { user, password }, gmes: { user: arg('--itqan-user', user), password: arg('--itqan-password', password) },
    ...(urls.hr ? { hr: { user: arg('--hr-user', user), password: arg('--hr-password', password) } } : {}),
  };
  const report = await checkReadiness({ urls, logins, backup: process.argv.includes('--backup') });
  printReadiness(report);
  process.exit(report.ok ? 0 : 1);
}
