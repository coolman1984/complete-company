// Proves the importer against the real applications: hosts Mizan and Itqan (and no HR), pairs them, imports the shipped templates
// twice, and checks what the applications themselves report. Start with the working directory GMES/apps/mes-server and `--import tsx`
// (scripts/test.ps1 does). The second run must create nothing.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pair } from '../portal/pair.mjs';
import { host, rootOf } from '../scenario/engine/host.mjs';
import { apply, loadFolder, validate } from './masters.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = rootOf(join(here, '..', 'scenario', 'engine'));
const out = join(root, 'complete-company', 'scenario', 'out', 'import-smoke');
const h = await host({ root, out, company: { name: 'Import Test Co', code: 'ITC' }, startDay: '2026-10-01', hr: false });
let ok = true;
const say = (good, what, detail = '') => { console.log(`  ${good ? 'ok  ' : 'FAIL'} ${what}${detail ? '  ' + detail : ''}`); if (!good) ok = false; };
try {
  const { mizan: mz, gmes: gm } = h.clients;
  const paired = await pair({ urls: h.urls, logins: h.logins });
  say(paired.ok, 'the applications are paired');
  const pump = async () => { for (let i = 0; i < 3; i++) { await mz('POST', '/api/eco/sync'); await gm('POST', '/api/eco/push'); } };
  const checked = validate(loadFolder(join(here, 'templates')));
  say(checked.problems.length === 0, 'the templates pass the checks');

  const first = await apply(checked.model, { mz, gm, pump });
  say(first.created.parties === 3 && first.created.items === 5, 'Mizan took 3 parties and 5 items', JSON.stringify(first.created));
  say(first.created.plant === 6 && first.created.routings === 1 && first.created.boms === 1, 'Itqan took the plant, the routing and the bill of materials', JSON.stringify(first.created));

  const items = await mz('GET', '/api/items');
  const rc = (Array.isArray(items) ? items : items.rows).find((i) => i.sku === 'RC-1');
  say(rc && rc.procurement_type === 'make' && rc.tracking === 'serial', 'Mizan holds the finished item as made and serial-tracked');
  const pcb = (Array.isArray(items) ? items : items.rows).find((i) => i.sku === 'PCB-R');
  say(pcb && pcb.lead_time_days === 20 && pcb.moq === 500_000 && pcb.lot_size === 500_000, 'a bought part keeps its lead time and order quantities (x1000)');
  const supplier = await mz('GET', '/api/parties');
  say((Array.isArray(supplier) ? supplier : supplier.rows).some((p) => p.name === 'Example Electronic Components Ltd'), 'the supplier is in Mizan');

  const routings = await gm('GET', '/api/routings?status=approved');
  say(routings.length === 1 && routings[0].ops === 3, 'Itqan has the approved routing with 3 operations');
  const boms = await gm('GET', '/api/boms?status=approved');
  say(boms.length === 1 && boms[0].lines === 4, 'Itqan has the approved bill of materials with 4 lines');
  const plant = await gm('GET', '/api/plant');
  say(plant.some((n) => n.code === 'L1-TEST' && n.type === 'station'), 'the stations exist under their line');
  const planning = await gm('GET', '/api/pln/settings');
  say(planning.itemLines.some((l) => l.item_code === 'RC-1' && l.line_code === 'L1'), 'the finished item is assigned to its line');

  const again = await apply(checked.model, { mz, gm, pump });
  say(Object.keys(again.created).length === 0, 'running it again creates nothing', JSON.stringify(again));
  say(again.skipped.items === 5 && again.skipped.boms === 1, 'everything is reported as already there', JSON.stringify(again.skipped));
} finally { await h.stop(); }
console.log(ok ? 'IMPORT SMOKE: PASSED' : 'IMPORT SMOKE: FAILED');
process.exit(ok ? 0 : 1);
