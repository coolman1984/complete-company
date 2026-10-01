// Film 2 (second cut, owner's notes 2026-10-01: a still camera, screens where production MOVES, the reports): one day of
// a tile line, filmed in Itqan's own screens, then the container in Space Planner.
//   cd GMES/apps/mes-server
//   node --disable-warning=ExperimentalWarning --import tsx ../../../complete-company/agent/studio/shoot-line-day.mjs
// (Itqan is TypeScript and runs INSIDE this process on a studio clock, the way the scenario engine runs it, so a working
// day of eight hours can be filmed in a minute: each hour the clock moves on and the stations book that hour's output.)
// Then: node agent/studio/render.mjs --cut agent/studio/cuts/line-day.json --take line=..\_agent-film\take-line --take ship=..\_agent-film\take-ship <out.mp4>
//
// What is real: every number on screen is a booking the server accepted (work order, output by lot, scrap by reason, the
// kiln stoppage), read back through the API before the take ends. What is staged: the clock (an hour of the shift passes
// in a few seconds) and who books the hourly output (the film books it through the same API the stations use; the last
// hour is booked by the agent itself on the operator station). The board's own 30-second refresh is asked for at once.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, openSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch, until } from '../cdp.mjs';
import { stage } from '../stage.mjs';
import * as gmes from '../skills/gmes.mjs';
import * as space from '../skills/space.mjs';
import { film } from './record.mjs';
import { seedGmes } from './sets/gmes-tile-line.mjs';
import { makeClock, localDay } from '../../scenario/engine/clock.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const out = join(root, '_agent-film');
const pace = Number(process.env.AGENT_PACE ?? 1);
const view = { width: 1600, height: 1000, scale: 1.5, timezone: 'Africa/Cairo' };
const ar = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const procs = [];
const stops = [];
function serve(cmd, args, cwd, env, log) { const o = openSync(join(out, log), 'a'); const p = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', o, o] }); procs.push(p); return p; }
const hold = (ms) => new Promise((r) => setTimeout(r, pace ? ms : 50));

try {
  for (const d of ['gmes-data', 'space-data', 'take-line', 'take-ship', 'browser-line', 'browser-ship']) rmSync(join(out, d), { recursive: true, force: true });
  mkdirSync(join(out, 'gmes-data'), { recursive: true });

  // ---------------------------------------------------------------- Itqan on the studio clock (yesterday, 07:00 plant time)
  process.env.GMES_SECRETS = 'plain'; process.env.GMES_PLAN_LOOP = 'off';
  const src = join(root, 'GMES', 'apps', 'mes-server', 'src');
  const { buildApp } = await import(pathToFileURL(join(src, 'app.ts')).href);
  const { systemClock } = await import(pathToFileURL(join(src, 'kernel', 'clock.ts')).href);
  const day = localDay(Date.now() - 86_400_000);
  const clock = makeClock(day, '07:00', systemClock.newId); // at the start of the production day: the session's "today" is that day
  const app = await buildApp({ dbFile: join(out, 'gmes-data', 'gmes.db'), backupDir: join(out, 'gmes-data', 'backups'), clock,
    config: { companyId: '0192f0a0-0000-7000-8000-000000000001', node: 'plant-1', timeZone: 'Africa/Cairo', productionDayStart: '07:00', ownership: { item: 'gmes', warehouse: 'gmes', person: 'none' } } });
  stops.push(() => app.close());
  await app.http.listen({ host: '127.0.0.1', port: 0 });
  const G = `http://127.0.0.1:${app.http.server.address().port}`;
  const { api, cmd, issueMaterials } = await seedGmes(G, 'Demo-2026!', { workOrder: false, capacityPerShift: 1600 });

  let b = await launch({ profileDir: join(out, 'browser-line'), headless: true });
  let page = await b.open(G + '/', view);
  // the browser reads the same studio clock (the board's clock and its current hour)
  const offset = () => clock.now().getTime() - Date.now();
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { window.__studioOffset = ${offset()}; const R = Date; class D extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + window.__studioOffset); } static now() { return R.now() + window.__studioOffset; } } window.Date = D; })();` });
  await page.goto(G + '/');
  const at = async (hhmm) => { clock.at(day, hhmm); await page.evaluate(`window.__studioOffset = ${offset()}`); };
  // signed in before the camera rolls: the film starts on the plan
  await gmes.signIn(stage(page, { pace: 0, captions: false }), { user: 'admin', password: 'Demo-2026!' });
  await page.evaluate(`location.hash = '#EXE2010'`);
  await page.waitFor(`!!document.querySelector('.mes-plan-row')`, { timeout: 20_000 });

  let wo;
  const line = await film(page, join(out, 'take-line'), async ({ onEvent }) => {
    const s = stage(page, { pace, onEvent, captions: false, log: (t) => t && console.log('  agent:', t) });
    await s.wait(1200);
    // ---- scene 02: the plan becomes a work order
    s.mark('scene', { n: 2 });
    await at('07:01');
    wo = await gmes.releaseFromPlan(s, api, { itemCode: 'TL-6060-WHT', qty: 1440, line: 'L1',
      explain: 'خطة النهارده: ١٬٤٤٠ م² بورسلين ٦٠×٦٠ أبيض على خط البلاط ١، الوردية أ',
      doneExplain: 'الخطة بقت أمر شغل، والخط محمّل ٩٠٪ من طاقته في الوردية' });
    await s.wait(2500);
    await issueMaterials(wo.id);
    await s.say('الخامات اتصرفت للأمر بلوتاتها: طفلة وفلسبار وجليز وكراتين');
    await s.wait(1500);

    // ---- scene 03: the line runs, hour by hour, and the agent watches the board
    s.mark('scene', { n: 3 });
    await at('07:06');
    const refresh = await gmes.watchBoard(s, { line: 'L1', explain: 'الساعة ٧ الخط بدأ. بتابع لوحة الخط ساعة بساعة' });
    const box = await page.evaluate(`(() => { const r = document.querySelector('.bd').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; })()`);
    s.mark('focus', { box });
    await s.wait(1500);
    const book = (qty) => api('POST', `/api/work-orders/${wo.id}/complete`, { commandId: cmd(), qty: String(qty), lotNo: 'S07-C2', station: 'L1-SP' });
    const scrap = (qty, reasonCode) => api('POST', `/api/work-orders/${wo.id}/scrap`, { commandId: cmd(), qty: String(qty), reasonCode, station: 'L1-SP' });
    const hour = async (hhmm, good, say, more) => { await at(hhmm); await book(good); if (more) await more(); await refresh(); s.mark('hour', { clock: hhmm, good }); await s.say(say); await s.wait(2800); };
    await hour('07:55', 185, 'من ٧ لـ ٨: ١٨٥ م². الخطة ٢٠٠ في الساعة');
    await hour('08:55', 195, 'من ٨ لـ ٩: ١٩٥ م²، قريب من الخطة');
    await hour('09:55', 160, 'من ٩ لـ ١٠: ٢٠٠ م²، منهم ٤٠ فيها شروخ من الفرن', () => scrap(40, 'kiln_crack'));
    // the kiln stops
    await at('10:05');
    const st = await api('POST', '/api/stoppages', { commandId: cmd(), line: 'L1', station: 'L1-KL', reason: 'kiln-temp' });
    await refresh();
    s.mark('stopped', { id: st.id ?? null });
    await s.say('١٠:٠٥ الفرن وقف: الحرارة خارج الحدود. اللوحة قلبت أحمر في نفس اللحظة');
    await s.wait(2600);
    await at('10:40');
    await api('POST', `/api/stoppages/${(st.id ?? st.stoppage?.id)}/end`, { commandId: cmd() });
    await refresh();
    s.mark('resumed');
    await s.say('١٠:٤٠ الحرارة رجعت والخط اشتغل. الوقفة اتسجلت ٣٥ دقيقة بسببها');
    await s.wait(1800);
    await hour('10:55', 120, 'من ١٠ لـ ١١: ١٢٠ م² بس بسبب الوقفة، والفرق باين على اللوحة');
    await hour('11:55', 175, 'من ١١ لـ ١٢: ١٧٥ م² سليم، و٢٠ م² تقشير من المكبس', () => scrap(20, 'lamination'));
    await hour('12:55', 200, 'من ١٢ لـ ١: ٢٠٠ م²، على الخطة بالظبط');
    await hour('13:55', 120, 'من ١ لـ ٢: ١٢٠ م² سليم، و٨٠ م² نزلت فرز تاني', () => scrap(80, 'downgrade'));
    s.mark('wide');
    // the last hour: the agent books it itself, on the operator station of sorting and packing
    await at('14:50');
    await gmes.atStation(s, api, { line: 'L1', station: 'L1-SP', explain: 'آخر ساعة: بسجّلها بنفسي من محطة الفرز والتعبئة' });
    await gmes.goodQty(s, api, { woId: wo.id, qty: 145, lot: 'S07-C2', explain: 'من ٢ لـ ٣: ١٤٥ م² فرز أول، نفس اللوط S07-C2' });
    await at('14:55');
    const refresh2 = await gmes.watchBoard(s, { line: 'L1', explain: 'ونرجع للوحة' });
    await refresh2();
    const done = await api('GET', `/api/work-orders/${wo.id}`);
    if (Number(done.completed_qty) !== 1300 || Number(done.scrapped_qty) !== 140 || done.status !== 'completed') throw new Error('the work order holds ' + JSON.stringify([done.completed_qty, done.scrapped_qty, done.status]));
    s.mark('proven', { what: 'order complete', completed: done.completed_qty, scrapped: done.scrapped_qty });
    await s.say('أمر الشغل خلص: ١٬٣٠٠ م² سليم و١٤٠ فاقد = ١٬٤٤٠ م² المطلوبة بالظبط');
    await s.wait(3500);

    // ---- scene 04: the reports
    s.mark('scene', { n: 4 });
    s.mark('wide');
    await gmes.openReport(s, 'RPT4010', { explain: 'تقرير الإنتاج اليومي: المخطط والسليم والتحقيق والكفاءة', ready: `location.hash === '#RPT4010' && document.body.innerText.includes('1,300')` });
    await s.wait(4500);
    await gmes.openReport(s, 'RPT4020', { explain: 'تقرير الفاقد: كل متر ضايع معروف سببه ونسبته', ready: `location.hash === '#RPT4020' && document.body.innerText.includes('شرخ في الفرن')` });
    await s.wait(4500);
    await gmes.openReport(s, 'OEE4010', { explain: 'وكفاءة الخط: الوقفة والسرعة والجودة في رقم واحد', ready: `location.hash === '#OEE4010' && !!document.querySelector('svg')` });
    await s.wait(4500);
    const board = await api('GET', '/api/boards/line/L1');
    s.mark('done');
    return { wo: done.code, completed: done.completed_qty, scrapped: done.scrapped_qty, status: done.status, oee: board.oee?.oee ?? null };
  });
  console.log('ok  line take:', JSON.stringify(line.result), `${(line.duration / 1000).toFixed(1)} s`);
  await b.close();

  // ---------------------------------------------------------------- the shipment (Space Planner)
  serve(process.execPath, ['apps/server/dist/server.mjs', '--data', join(out, 'space-data'), '--port', '4732'], join(root, '3D-Modeling'), {}, 'space.log');
  const S = 'http://127.0.0.1:4732';
  await until(() => fetch(S + '/api/health').then((r) => r.ok), { what: 'Space Planner', timeout: 60_000 });
  const sapi = async (m, p, body) => { const r = await fetch(S + p, { method: m, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(p + ' ' + t.slice(0, 200)); return t ? JSON.parse(t) : null; };
  b = await launch({ profileDir: join(out, 'browser-ship'), headless: true });
  page = await b.open(S + '/', view);
  const ship = await film(page, join(out, 'take-ship'), async ({ onEvent }) => {
    const s = stage(page, { pace, onEvent, captions: false, log: (t) => t && console.log('  agent:', t) });
    s.mark('scene', { n: 5 });
    const r = await space.planShipment(s, sapi, {
      name: 'Tiles S07-C2 · Delta distributor', containerLabel: '40′ high cube',
      part: { name: 'Tile pallet 60x60 (40 cartons)', length: 1100, width: 1100, height: 1000, quantity: 23, kg: 1305, mayTilt: false },
      explain: 'الشحنة جاهزة: ٢٣ بالتة من لوط S07-C2، كل بالتة ١٬٣٠٥ كجم. بحسب الحاويات في مخطط المساحات',
      answerSay: (n) => `الحاوية ٤٠ قدم فيها مكان لـ٤٠ بالتة، بس حمولتها ٢٦٫٥ طن بتسمح بـ٢٠ بس: يبقى ${n === 2 ? 'حاويتين' : ar(n) + ' حاويات'}`,
    });
    const [c1, c2] = r.containers;
    await space.playStuffing(s, { seconds: pace ? 12 : 1, explain: `بشغّل التحميل: بالتة واحدة في الارتفاع وموزّعة على الأرضية عشان الوزن يتوازن. الأولى ${ar(c1.pieces)} بالتة (${ar((c1.kg / 1000).toFixed(1)).replace('.', '٫')} طن)، والتانية ${ar(c2.pieces)} بالتات` });
    s.mark('done');
    return r;
  });
  console.log('ok  ship take:', JSON.stringify(ship.result), `${(ship.duration / 1000).toFixed(1)} s`);
  await b.close();
} catch (e) {
  console.error('FAIL', e.stack ?? e.message);
  process.exitCode = 1;
} finally {
  for (const p of procs) p.kill();
  for (const f of stops) await f().catch(() => {});
  process.exit(process.exitCode ?? 0);
}
