// Starts the hosted applications, pairs them, moves the clock and stops: proves the hosting works before any story runs on it.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pair } from '../../portal/pair.mjs';
import { host, rootOf } from './host.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = rootOf(here);
const out = join(root, 'complete-company', 'scenario', 'out', 'smoke-host');
const h = await host({ root, out, company: { name: 'Nile Vision Electronics', code: 'NVE' }, startDay: '2026-07-01' });
let ok = true;
const say = (good, what, detail = '') => { console.log(`  ${good ? 'ok  ' : 'FAIL'} ${what}${detail ? '  ' + detail : ''}`); if (!good) ok = false; };
try {
  say(!!h.company, 'Mizan has a company id', h.company);
  say((await h.clients.gmes('GET', '/api/health')).company === h.company, 'GMES runs under the same company id');
  say(!!h.urls.hr, 'HR-System is up in simulation');
  const paired = await pair({ urls: h.urls, logins: h.logins });
  say(paired.ok, 'the applications are paired', JSON.stringify(paired.steps.filter((s) => !s.ok)));
  h.clock.at('2026-07-02', '08:00');
  await h.clients.hr('PUT', '/api/sim/today', { today: '2026-07-02' });
  say((await h.clients.hr('GET', '/api/sim/today')).today === '2026-07-02', 'HR follows the simulated date');
  const day = await h.clients.mizan('GET', '/api/reports/trial-balance?from=2026-07-01&to=2026-07-31');
  say(day.balanced === true, 'Mizan answers on the simulated clock');
} finally { await h.stop(); }
console.log(ok ? 'SMOKE HOST: PASSED' : 'SMOKE HOST: FAILED');
process.exit(ok ? 0 : 1);
