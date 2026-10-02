// Proves the importer against the real applications: hosts Mizan and Itqan (and no HR), pairs them, imports a folder of CSV files
// twice, and checks what the applications themselves report. Two companies: the shipped electronics templates and the ceramic company.
// Start with the working directory GMES/apps/mes-server and `--import tsx` (scripts/test.ps1 does). The second run must create nothing.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pair } from '../portal/pair.mjs';
import { host, rootOf } from '../scenario/engine/host.mjs';
import { apply, loadFolder, validate } from './masters.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = rootOf(join(here, '..', 'scenario', 'engine'));
let ok = true;
const say = (good, what, detail = '') => { console.log(`  ${good ? 'ok  ' : 'FAIL'} ${what}${detail ? '  ' + detail : ''}`); if (!good) ok = false; };
const rows = (x) => (Array.isArray(x) ? x : x.rows ?? []);

const COMPANIES = [
  { name: 'Electronics templates', folder: 'templates', company: 'Import Test Co', counts: { parties: 3, items: 5, plant: 6, routings: 1, boms: 1 },
    check: async ({ mz, gm }) => {
      const rc = rows(await mz('GET', '/api/items')).find((i) => i.sku === 'RC-1');
      say(rc && rc.procurement_type === 'make' && rc.tracking === 'serial', 'Mizan holds the finished item as made and serial-tracked');
      const pcb = rows(await mz('GET', '/api/items')).find((i) => i.sku === 'PCB-R');
      say(pcb && pcb.lead_time_days === 20 && pcb.moq === 500_000 && pcb.lot_size === 500_000, 'a bought part keeps its lead time and order quantities (x1000)');
      say((await gm('GET', '/api/routings?status=approved'))[0]?.ops === 3, 'Itqan has the approved routing with 3 operations');
      say((await gm('GET', '/api/boms?status=approved'))[0]?.lines === 4, 'Itqan has the approved bill of materials with 4 lines');
      say((await gm('GET', '/api/plant')).some((n) => n.code === 'L1-TEST' && n.type === 'station'), 'the stations exist under their line');
      say((await gm('GET', '/api/pln/settings')).itemLines.some((l) => l.item_code === 'RC-1' && l.line_code === 'L1'), 'the finished item is assigned to its line');
    } },
  { name: 'Ceramic company', folder: 'ceramic', company: 'Demo Ceramics Co.', counts: { parties: 11, items: 14, plant: 15, routings: 4, boms: 4 },
    check: async ({ mz, gm }) => {
      const tile = rows(await mz('GET', '/api/items')).find((i) => i.sku === 'TL-6060-WHT');
      say(tile && tile.unit === 'M2' && tile.procurement_type === 'make' && tile.tracking === 'batch' && tile.sale_price === 32000, 'the tile is a made, lot-tracked item in m2 with its price in piastres');
      const glaze = rows(await mz('GET', '/api/items')).find((i) => i.sku === 'GLZ-WHT');
      say(glaze && glaze.purchase_price === 4500 && glaze.lead_time_days === 10, 'the glaze keeps its price and 10-day lead time');
      const gid = Object.fromEntries((await gm('GET', '/api/items')).map((i) => [i.code, i.id]));
      const routing = (await gm('GET', '/api/routings?status=approved')).find((r) => r.item_id === gid['TL-6060-WHT'] || r.item_code === 'TL-6060-WHT');
      const detail = await gm('GET', `/api/routings/${routing.id}`);
      say(detail.operations.map((o) => o.code).join(',') === 'PR,DR,GL,KL,SP', 'the routing is press, dry, glaze, kiln, sort and pack', JSON.stringify(detail.operations.map((o) => o.code)));
      say(detail.operations.filter((o) => o.mandatory).map((o) => o.code).join(',') === 'PR,GL,SP', 'a unit is scanned at press, glazing and packing (drying and kiln are optional)');
      const bom = await gm('GET', `/api/boms/${(await gm('GET', '/api/boms?status=approved')).find((b) => b.item_id === gid['TL-6060-WHT'] || b.item_code === 'TL-6060-WHT').id}`);
      const per = Object.fromEntries(bom.lines.map((l) => [l.component_code, l.qty_per]));
      say(per['CLAY-RED'] === '18' && per['FELDSPAR'] === '4' && per['KAOLIN'] === '2' && per['GLZ-WHT'] === '0.8' && per['CTN-60'] === '0.7', 'the bill of materials per m2 of the white 60x60: 18 kg clay, 4 kg feldspar, 2 kg kaolin, 0.8 kg glaze, 0.7 carton', JSON.stringify(per));
      say((await gm('GET', '/api/plant')).filter((n) => n.type === 'station').length === 10, 'five stations on each of the two lines');
    } },
];

for (const c of COMPANIES) {
  console.log(`${c.name}`);
  const h = await host({ root, out: join(root, 'complete-company', 'scenario', 'out', 'import-smoke'), company: { name: c.company, code: 'ITC' }, startDay: '2026-10-01', hr: false });
  try {
    const { mizan: mz, gmes: gm } = h.clients;
    say((await pair({ urls: h.urls, logins: h.logins })).ok, 'the applications are paired');
    const pump = async () => { for (let i = 0; i < 3; i++) { await mz('POST', '/api/eco/sync'); await gm('POST', '/api/eco/push'); } };
    const checked = validate(loadFolder(join(here, c.folder)));
    say(checked.problems.length === 0 && checked.warnings.length === 0, 'the files pass the checks without errors or warnings', JSON.stringify([...checked.problems, ...checked.warnings].slice(0, 3)));
    const first = await apply(checked.model, { mz, gm, pump });
    say(JSON.stringify(first.created) === JSON.stringify(c.counts), 'everything was entered', JSON.stringify(first.created));
    await c.check({ mz, gm });
    const again = await apply(checked.model, { mz, gm, pump });
    say(Object.keys(again.created).length === 0, 'running it again creates nothing', JSON.stringify(again.created));
    say(JSON.stringify(again.skipped) === JSON.stringify(c.counts), 'everything is reported as already there', JSON.stringify(again.skipped));
  } finally { await h.stop(); }
}
console.log(ok ? 'IMPORT SMOKE: PASSED' : 'IMPORT SMOKE: FAILED');
process.exit(ok ? 0 : 1);
