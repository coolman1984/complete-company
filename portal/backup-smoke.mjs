// Isolated four-application rehearsal. Run from GMES/apps/mes-server with --import tsx.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { host, rootOf } from '../scenario/engine/host.mjs';
import { pair, session } from './pair.mjs';
import { backupAll } from './backup.mjs';
import { checkReadiness } from '../ready/check.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = rootOf(join(here, '..', 'scenario', 'engine'));
const evidence = join(root, '.dashboard');
mkdirSync(evidence, { recursive: true });
const scratch = mkdtempSync(join(evidence, 'four-apps-smoke-'));
const port = await new Promise((resolve, reject) => {
  const s = createServer();
  s.once('error', reject);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
});
const planner = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(root, '3D-Modeling', 'apps', 'server', 'dist', 'server.mjs'), '--port', String(port), '--data', join(scratch, 'planner')], { cwd: join(root, '3D-Modeling'), windowsHide: true, stdio: 'ignore' });
let stack;
try {
  const space = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  for (;;) {
    try { if ((await fetch(space + '/api/health', { signal: AbortSignal.timeout(1000) })).ok) break; } catch { /* starting */ }
    if (Date.now() >= deadline || planner.exitCode !== null) throw new Error('Planner fixture did not start');
    await new Promise(r => setTimeout(r, 200));
  }
  const pc = session(space, '');
  const project = await pc('POST', '/api/projects', { name: 'Backup rehearsal hall', template: 'demo' });
  stack = await host({ root, out: join(scratch, 'business'), company: { name: 'Four App Rehearsal', code: 'FOUR' }, password: 'Own-Strong-Pass-7!', startDay: '2026-10-01', hr: true });
  const urls = { ...stack.urls, space };
  const paired = await pair({ urls, logins: stack.logins });
  assert.equal(paired.ok, true, JSON.stringify(paired.steps.filter(s => !s.ok)));
  const report = await checkReadiness({ urls, logins: stack.logins, backup: true });
  assert.equal(report.ok, true, JSON.stringify(report.checks.filter(c => !c.ok)));
  assert.equal(report.checks.filter(c => c.area === 'Running' && c.ok).length, 4);
  assert.equal(report.checks.filter(c => c.area === 'Backup' && c.ok).length, 4);
  const copies = await backupAll({ urls, logins: stack.logins });
  assert.equal(copies.ok, true, JSON.stringify(copies.results));
  assert.deepEqual(copies.results.map(r => r.key), ['mizan', 'gmes', 'hr', 'space']);
  assert.deepEqual(await pc('GET', `/api/projects/${project.id}`), project, 'backup preserves the live planner project');
  console.log('FOUR APP BACKUP SMOKE: PASSED (four health checks, four rehearsed snapshots, live project preserved)');
  console.log(`Evidence: ${scratch}`);
} finally {
  if (stack) await stack.stop();
  planner.kill();
  await new Promise(resolve => { if (planner.exitCode !== null) return resolve(); planner.once('exit', resolve); setTimeout(resolve, 3000).unref(); });
}
