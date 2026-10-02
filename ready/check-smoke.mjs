// Proves the readiness check against real applications: an installation still on the demonstration password is NOT ready, one with
// its own password is. Run with the working directory GMES/apps/mes-server and `--import tsx` (scripts/test.ps1 does).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pair } from '../portal/pair.mjs';
import { host, rootOf } from '../scenario/engine/host.mjs';
import { checkReadiness } from './check.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = rootOf(join(here, '..', 'scenario', 'engine'));
let ok = true;
const say = (good, what, detail = '') => { console.log(`  ${good ? 'ok  ' : 'FAIL'} ${what}${detail ? '  ' + detail : ''}`); if (!good) ok = false; };

async function run(label, password, expectReady) {
  const h = await host({ root, out: join(root, 'complete-company', 'scenario', 'out', 'ready-smoke'), company: { name: 'Ready Test Co', code: 'RTC' }, password, startDay: '2026-10-01', hr: true });
  try {
    for (let i = 0; i < 2; i++) {
      const paired = await pair({ urls: h.urls, logins: h.logins });
      say(paired.ok, `pairing attempt ${i + 1}`, paired.ok ? '' : JSON.stringify(paired.steps.filter(s => !s.ok)));
    }
    for (let i = 0; i < 3; i++) { await h.clients.mizan('POST', '/api/eco/sync'); await h.clients.gmes('POST', '/api/eco/push'); }
    const r = await checkReadiness({ urls: h.urls, logins: h.logins, backup: true });
    const failed = r.checks.filter((c) => !c.ok).map((c) => c.name);
    say(r.ok === expectReady, label, expectReady ? JSON.stringify(failed) : `refused: ${failed.join('; ')}`);
    if (!expectReady) say(failed.some((n) => /refuses the demonstration passwords/.test(n)), 'and the reason is the demonstration password');
    if (expectReady) {
      say(r.checks.filter((c) => c.area === 'Backup' && c.ok).length === 3, 'all three connected applications made a backup and passed their rehearsal');
      say(r.checks.some(c => c.name.startsWith('HR uses') && c.ok), 'HR identity and delivery connections were checked');
    }
  } finally { await h.stop(); }
}
await run('an installation still on a demonstration password is not ready', 'Demo-2026!', false);
await run('an installation with its own password, paired and drained, is ready', 'Own-Strong-Pass-7!', true);
console.log(ok ? 'READY SMOKE: PASSED' : 'READY SMOKE: FAILED');
process.exit(ok ? 0 : 1);
