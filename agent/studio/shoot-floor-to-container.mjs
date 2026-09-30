// Film 2 in one command: starts a GMES and a Space Planner of their own (sibling folders ..\GMES and ..\3D-Modeling,
// Space Planner built once with `pnpm -r build`), sets up the tile line, films the floor take (production and quality)
// and the shipment take (container), each at presentation pace, into ..\..\..\_agent-film\. Then renders with:
//   node agent/studio/render.mjs --cut agent/studio/cuts/floor-to-container.json --take floor=..\_agent-film\take-floor --take ship=..\_agent-film\take-ship ..\_agent-film\film2.mp4
// Nothing touches real data: both applications run on fresh folders under _agent-film and are stopped at the end.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, openSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, until } from '../cdp.mjs';
import { stage } from '../stage.mjs';
import * as gmes from '../skills/gmes.mjs';
import * as space from '../skills/space.mjs';
import { film } from './record.mjs';
import { seedGmes } from './sets/gmes-tile-line.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const out = join(root, '_agent-film');
const pace = Number(process.env.AGENT_PACE ?? 1);
const view = { width: 1600, height: 1000, scale: 1.5, timezone: 'Africa/Cairo' };
const ar = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const procs = [];
function serve(cmd, args, cwd, env, log) { const o = openSync(join(out, log), 'a'); const p = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', o, o] }); procs.push(p); return p; }

try {
  for (const d of ['gmes-data', 'space-data', 'take-floor', 'take-ship', 'browser-floor', 'browser-ship']) rmSync(join(out, d), { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  // ---------------------------------------------------------------- take 1: the tile line (GMES)
  serve(process.execPath, ['--disable-warning=ExperimentalWarning', '--import', 'tsx', 'src/main.ts'], join(root, 'GMES', 'apps', 'mes-server'),
    { GMES_DATA_DIR: join(out, 'gmes-data'), GMES_PORT: '4731', GMES_HOST: '127.0.0.1', GMES_COMPANY_ID: '0192f0a0-0000-7000-8000-000000000001', GMES_OWNER: 'gmes', GMES_PERSON_OWNER: 'none', GMES_SECRETS: 'plain' }, 'gmes.log');
  const G = 'http://127.0.0.1:4731';
  await until(() => fetch(G + '/api/health').then((r) => r.ok), { what: 'GMES', timeout: 90_000 });
  const { api, woId } = await seedGmes(G);
  let b = await launch({ profileDir: join(out, 'browser-floor'), headless: true });
  let page = await b.open(G + '/', view);
  const floor = await film(page, join(out, 'take-floor'), async ({ onEvent }) => {
    const s = stage(page, { pace, onEvent, captions: false, log: (t) => t && console.log('  agent:', t) });
    await gmes.signIn(s, { user: 'admin', password: 'Demo-2026!' });
    s.mark('scene', { n: 2 });
    await gmes.atStation(s, api, { line: 'L1', station: 'L1-KL', explain: 'بروح محطة العامل عند الفرن على خط البلاط' });
    await gmes.stopAndResume(s, api, { line: 'L1', reasonText: 'حرارة الفرن خارج الحدود', seconds: pace ? 2.5 : 0.3,
      explain: 'حساس الفرن قرا حرارة خارج الحدود: بوقّف الخط وبسجّل السبب', resumeExplain: 'الحرارة رجعت طبيعية: بشغّل الخط تاني، والتوقف اتسجّل بمدته وسببه' });
    await gmes.atStation(s, api, { line: 'L1', station: 'L1-SP', explain: 'بروح محطة الفرز والتعبئة: هنا بيتحدد الفرز واللوط' });
    await gmes.goodQty(s, api, { woId, qty: 650, lot: 'S07-C2', explain: 'وردية الصبح: ٦٥٠ م² فرز أول، درجة لون ٠٧ ومقاس ٢' });
    await gmes.goodQty(s, api, { woId, qty: 650, lot: 'S07-C2', explain: 'وردية المسا: ٦٥٠ م² تاني من نفس اللوط' });
    s.mark('scene', { n: 3 });
    await gmes.scrapQty(s, api, { woId, qty: 40, reasonText: 'شرخ في الفرن', explain: 'الفرز لقى ٤٠ م² فيها شروخ من الفرن' });
    await gmes.scrapQty(s, api, { woId, qty: 20, reasonText: 'تقشير في المكبس', explain: 'و٢٠ م² تقشير من المكبس' });
    await gmes.scrapQty(s, api, { woId, qty: 80, reasonText: 'نزل فرز تاني', explain: 'و٨٠ م² نزلت فرز تاني' });
    const wo = await api('GET', `/api/work-orders/${woId}`);
    if (Number(wo.completed_qty) !== 1300 || Number(wo.scrapped_qty) !== 140) throw new Error('the work order holds ' + JSON.stringify([wo.completed_qty, wo.scrapped_qty]));
    await gmes.openReport(s, 'RPT4020', { explain: 'تقرير الفاقد: كل متر ضايع معروف سببه ونسبته', ready: `location.hash === '#RPT4020' && document.body.innerText.includes('شرخ في الفرن')` });
    await s.wait(2500);
    await gmes.openReport(s, 'RPT4010', { explain: 'وتقرير الإنتاج اليومي: المخطط والفعلي والكفاءة', ready: `location.hash === '#RPT4010' && document.body.innerText.includes('1,300')` });
    await s.wait(2500);
    s.mark('done');
    return { wo: wo.code, completed: wo.completed_qty, scrapped: wo.scrapped_qty, status: wo.status };
  });
  console.log('ok  floor take:', JSON.stringify(floor.result), `${(floor.duration / 1000).toFixed(1)} s`);
  await b.close();

  // ---------------------------------------------------------------- take 2: the shipment (Space Planner)
  serve(process.execPath, ['apps/server/dist/server.mjs', '--data', join(out, 'space-data'), '--port', '4732'], join(root, '3D-Modeling'), {}, 'space.log');
  const S = 'http://127.0.0.1:4732';
  await until(() => fetch(S + '/api/health').then((r) => r.ok), { what: 'Space Planner', timeout: 60_000 });
  const sapi = async (m, p, body) => { const r = await fetch(S + p, { method: m, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(p + ' ' + t.slice(0, 200)); return t ? JSON.parse(t) : null; };
  b = await launch({ profileDir: join(out, 'browser-ship'), headless: true });
  page = await b.open(S + '/', view);
  const ship = await film(page, join(out, 'take-ship'), async ({ onEvent }) => {
    const s = stage(page, { pace, onEvent, captions: false, log: (t) => t && console.log('  agent:', t) });
    s.mark('scene', { n: 4 });
    const r = await space.planShipment(s, sapi, {
      name: 'Tiles S07-C2 · Delta distributor', containerLabel: '40′ high cube',
      part: { name: 'Tile pallet 60x60 (40 cartons)', length: 1100, width: 1100, height: 1000, quantity: 23, kg: 1305, mayTilt: false },
      explain: 'الشحنة جاهزة: ٢٣ بالتة من لوط S07-C2، كل بالتة ١٬٣٠٥ كجم. بحسب الحاويات في مخطط المساحات',
      answerSay: (n) => `الحاوية ٤٠ قدم فيها مكان لـ٤٠ بالتة، بس حمولتها ٢٦٫٥ طن بتسمح بـ٢٠ بس: يبقى ${n === 2 ? 'حاويتين' : ar(n) + ' حاويات'}`,
    });
    const [c1, c2] = r.containers;
    await space.playStuffing(s, { seconds: pace ? 10 : 1, explain: `بشغّل التحميل: بالتة واحدة في الارتفاع وموزّعة على الأرضية عشان الوزن يتوازن. الأولى ${ar(c1.pieces)} بالتة (${ar((c1.kg / 1000).toFixed(1)).replace('.', '٫')} طن)، والتانية ${ar(c2.pieces)} بالتات` });
    s.mark('done');
    return r;
  });
  console.log('ok  ship take:', JSON.stringify(ship.result), `${(ship.duration / 1000).toFixed(1)} s`);
  await b.close();
} catch (e) {
  console.error('FAIL', e.message);
  process.exitCode = 1;
} finally {
  for (const p of procs) p.kill();
}
