// Gives the demo installation one easy sign-in for the owner's trial: admin / 123 in Mizan and Itqan (and the HR half in set-logins.py).
// The products refuse a password this short on their own screens, so, exactly as their own demo builders do (Mizan `npm run demo`, HR `make_demo.py`),
// it is written straight into the accounts of a DEMO data folder while the servers are stopped. Never run it on a real installation:
// it refuses a folder that does not carry the demo company's marker (company.json written by the scenario engine).
//   node --disable-warning=ExperimentalWarning --import tsx set-logins.mjs <data folder>      (cwd: GMES/apps/mes-server, where tsx is installed)
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PASSWORD = '123';
const folder = resolve(process.argv[2] ?? '');
const marker = join(folder, 'company.json');
if (!existsSync(marker) || JSON.parse(readFileSync(marker, 'utf8')).demo !== true) throw new Error(`${folder} is not a demo data folder (no company.json with "demo": true): refusing to touch its accounts`);
const root = resolve(import.meta.dirname, '..', '..', '..');   // .../Complete Company

// ---- Mizan
const { hashPassword: mizanHash } = await import(pathToFileURL(join(root, 'Accounting-sys', 'apps', 'server', 'dist', 'modules', 'system', 'auth.js')).href);
const mz = new DatabaseSync(join(folder, 'mizan', 'mizan.db'));
const mizanCols = new Set(mz.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
mz.prepare(`UPDATE users SET password_hash = ?${mizanCols.has('failed_logins') ? ', failed_logins = 0' : ''}${mizanCols.has('locked_until') ? ', locked_until = NULL' : ''} WHERE username = 'admin'`).run(mizanHash(PASSWORD));
mz.close();

// ---- Itqan
const { hashPassword: itqanHash } = await import(pathToFileURL(join(root, 'GMES', 'apps', 'mes-server', 'src', 'modules', 'system', 'users.ts')).href);
const gm = new DatabaseSync(join(folder, 'gmes', 'gmes.db'));
gm.prepare("UPDATE sys_user SET password_hash = ?, must_change = 0, failed = 0, status = 'active' WHERE login = 'admin'").run(await itqanHash(PASSWORD));
gm.close();
console.log('admin / 123 set in Mizan and Itqan');
