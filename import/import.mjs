// node import/import.mjs --folder <folder of CSV files> [--mizan http://127.0.0.1:3000 --gmes http://127.0.0.1:4100] [--apply]
// Credentials: --mizan-user/--mizan-password and --itqan-user/--itqan-password, or MIZAN_USER, MIZAN_PASSWORD, ITQAN_USER, ITQAN_PASSWORD.
// Without --apply nothing is created: the folder is only read and checked, and every problem is listed with its file and line.
import { resolve } from 'node:path';
import { client } from '../scenario/engine/client.mjs';
import { apply, loadFolder, printProblems, validate } from './masters.mjs';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const folder = arg('--folder');
if (!folder) { console.error('usage: node import/import.mjs --folder <folder> [--mizan URL --gmes URL] [--apply]'); process.exit(2); }

const tables = loadFolder(resolve(folder));
const found = Object.entries(tables).filter(([, t]) => t.present).map(([n, t]) => `${n}.csv (${t.records.length} rows)`);
console.log(found.length ? `Read: ${found.join(', ')}` : 'No CSV files found in the folder.');
const checked = validate(tables);
printProblems(checked);
console.log(`${checked.problems.length} error(s), ${checked.warnings.length} warning(s).`);
if (checked.problems.length) { console.log('Nothing was created. Fix the errors above and run again.'); process.exit(1); }
if (!process.argv.includes('--apply')) {
  const m = checked.model;
  console.log(`Dry run: would enter ${m.parties.length} parties, ${m.items.length} items, ${m.nodes.length} plant nodes, ${m.routings.size} routings, ${m.boms.size} bills of materials. Add --apply to do it.`);
  process.exit(0);
}

const mizanUrl = arg('--mizan'), gmesUrl = arg('--gmes');
if (!mizanUrl && !gmesUrl) { console.error('--apply needs --mizan and/or --gmes (the addresses of the running applications)'); process.exit(2); }
const mizanUser = arg('--mizan-user', process.env.MIZAN_USER), mizanPassword = arg('--mizan-password', process.env.MIZAN_PASSWORD);
const itqanUser = arg('--itqan-user', process.env.ITQAN_USER), itqanPassword = arg('--itqan-password', process.env.ITQAN_PASSWORD);
let mz = null, gm = null;
if (mizanUrl) {
  mz = client(mizanUrl, 'mizan_sid', () => ['POST', '/api/auth/login', { username: mizanUser, password: mizanPassword }]);
  await mz('POST', '/api/auth/login', { username: mizanUser, password: mizanPassword });
}
if (gmesUrl) {
  gm = client(gmesUrl, 'gmes_sid', () => ['POST', '/api/auth/login', { login: itqanUser, password: itqanPassword }]);
  await gm('POST', '/api/auth/login', { login: itqanUser, password: itqanPassword });
}
// the applications exchange through their own admin routes; with both addresses given the importer asks them to
const pump = mz && gm ? async () => { await mz('POST', '/api/eco/sync'); await gm('POST', '/api/eco/push'); } : null;
try {
  const done = await apply(checked.model, { mz, gm, pump });
  console.log('Created:', JSON.stringify(done.created), ' Already there (skipped):', JSON.stringify(done.skipped));
} catch (e) {
  console.error(`STOPPED: ${e.message}`);
  process.exit(1);
}
