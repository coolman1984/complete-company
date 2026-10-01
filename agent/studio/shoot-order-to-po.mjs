// Film 4: from the customer's order to the purchase order, filmed in Itqan's and Mizan's own screens (a still camera, whole
// screens, long enough to read). Itqan and Mizan run in this process, paired, on a studio clock (sets/order-to-po.mjs).
//   cd GMES/apps/mes-server
//   node --disable-warning=ExperimentalWarning --import tsx ../../../complete-company/agent/studio/shoot-order-to-po.mjs
//   (Accounting-sys built once: npm run build)
// Then: node agent/studio/render.mjs --cut agent/studio/cuts/order-to-po.json --take plant=..\_agent-film\take-plant --take buy=..\_agent-film\take-buy --take recv=..\_agent-film\take-recv <out.mp4>
// Staged, and said in the brief (agent/studio/film4/BRIEF.md): the order is entered in Mizan through its order API (Mizan has no
// order screen yet); the goods receipts go through Mizan's receipt API; the clock is a studio clock. Everything else is done in screens.
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../cdp.mjs';
import { stage } from '../stage.mjs';
import * as gmes from '../skills/gmes.mjs';
import * as mizan from '../skills/mizan.mjs';
import { film } from './record.mjs';
import { buildWorld, NEED, ORDER_M2 } from './sets/order-to-po.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const out = join(root, '_agent-film');
const pace = Number(process.env.AGENT_PACE ?? 1);
// a smaller page (1280 x 800) shown at 1456 px wide: the applications' text is 25 % larger on the film than at 1600 x 1000
const view = { width: 1280, height: 800, scale: 1.5, timezone: 'Africa/Cairo' };
const ar = (n) => Number(n).toLocaleString('ar-EG');
let world;

/** A browser signed in to an application, reading the studio clock. */
async function openApp(profile, url, signIn) {
  const b = await launch({ profileDir: join(out, profile), headless: true });
  const page = await b.open('about:blank', view);
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const o = ${world.h.clock.now().getTime() - Date.now()}; const R = Date; class D extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + o); } static now() { return R.now() + o; } } window.Date = D; })();` });
  await page.goto(url + '/');
  await signIn(stage(page, { pace: 0, captions: false }));
  return { b, page };
}
const gmesIn = (s) => gmes.signIn(s, { user: 'admin', password: 'Demo-2026!' });
const mizanIn = async (s) => { await s.page.waitFor(`!!document.querySelector('input[type=password]')`, { timeout: 20_000 }); await mizan.signIn(s, { user: 'admin', password: 'Demo-2026!' }); await s.page.waitFor(`document.body.innerText.includes('لوحة التحكم')`, { timeout: 20_000 }); };

try {
  for (const d of ['world', 'take-plant', 'take-buy', 'take-recv', 'browser-plant', 'browser-buy', 'browser-recv']) rmSync(join(out, d), { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const startDay = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  world = await buildWorld({ root, out: join(out, 'world'), startDay });
  const { gm, mz, h } = world;

  // ------------------------------------------------------------------------------ take 1: the order and the planning (Itqan)
  const A = await openApp('browser-plant', h.urls.gmes, gmesIn);
  await A.page.evaluate(`location.hash = '#PLN1020'`);
  await A.page.waitFor(`location.hash === '#PLN1020' && document.body.innerText.includes('أوامر البيع')`, { timeout: 20_000 });
  let order, run, reqs;
  const plant = await film(A.page, join(out, 'take-plant'), async ({ onEvent }) => {
    const s = stage(A.page, { pace, onEvent, captions: false, log: (t) => t && console.log('  agent:', t) });
    await s.wait(1800);
    // ---- scene 02: the order arrives
    s.mark('scene', { n: 2 });
    await s.say(`شاشة أوامر البيع في المصنع: لسه فاضية. الدلتا لمواد البناء بتطلب ${ar(ORDER_M2)} م² بورسلين ٦٠×٦٠ أبيض`);
    await s.wait(2600);
    order = await world.placeOrder();
    s.mark('arrived', { order: order.number });
    await s.say('الطلب اتسجّل في الحسابات، وبيروح المصنع لوحده');
    await s.wait(1500);
    await s.click({ text: 'استعلام', exact: false, within: 'button' }, { expect: `document.body.innerText.includes(${JSON.stringify(order.number)})`, timeout: 20_000 });
    const arrived = (await gm('GET', '/api/sales-orders')).find((o) => o.code === order.number);
    if (!arrived) throw new Error('the order did not reach the factory');
    s.mark('proven', { what: 'order arrived', order: order.number });
    await s.say(`وصل: ${order.number}، سطر واحد، ${ar(ORDER_M2)} م² بورسلين، من غير ما حد يكتبه تاني`);
    await s.wait(4200);
    // ---- scene 03: planning
    s.mark('scene', { n: 3 });
    run = await gmes.runPlanning(s, gm, {
      explain: 'دلوقتي التخطيط: بشغّل تخطيط الخامات على الطلب',
      doneSay: (r) => `التخطيط خلص: ${r.stats.plannedOrders === 1 ? 'أمر إنتاج واحد' : ar(r.stats.plannedOrders) + ' أوامر إنتاج'} مقترح و${ar(r.stats.requisitions)} طلبات شراء، وصفر أخطاء`,
    });
    await s.wait(3600);
    await gmes.goTo(s, 'PLN2040', { explain: `أمر الإنتاج المقترح: ${ar(ORDER_M2)} م² بورسلين على خط البلاط ١، مربوط بالطلب`, ready: `location.hash === '#PLN2040' && document.body.innerText.includes('TL-6060-WHT')` });
    s.mark('look', { what: 'planned order' });
    await s.wait(4800);
    await gmes.goTo(s, 'PLN2050', { explain: 'والخامات اللي لازم تتشترى: كل طلب شراء بكميته وميعاد الاحتياج وآخر ميعاد للطلب', ready: `location.hash === '#PLN2050' && document.body.innerText.includes('CLAY-RED')` });
    reqs = await gm('GET', '/api/pln/requisitions');
    const need = {};
    for (const r of reqs.filter((x) => x.status === 'open')) need[r.item.code] = (need[r.item.code] ?? 0) + Number(r.qty);
    if (JSON.stringify(Object.entries(NEED).sort()) !== JSON.stringify(Object.entries(need).sort())) throw new Error('planning asks for ' + JSON.stringify(need));
    s.mark('proven', { what: 'requisitions', need });
    await s.say(`طفلة ${ar(NEED['CLAY-RED'])} كجم، فلسبار ${ar(NEED.FELDSPAR)}، جليز ${ar(NEED['GLZ-WHT'])}، كراتين ${ar(NEED['CTN-60'])}: الطلب × وصفة التصنيع بالظبط`);
    await s.wait(6500);
    s.mark('done');
    return { order: order.number, planned: run.stats.plannedOrders, requisitions: run.stats.requisitions, errors: run.stats.errors, need };
  });
  console.log('ok  plant take:', JSON.stringify(plant.result), `${(plant.duration / 1000).toFixed(1)} s`);
  await world.pump();

  // ------------------------------------------------------------------------------ take 2: purchasing (Mizan)
  const B = await openApp('browser-buy', h.urls.mizan, mizanIn);
  const pos = [];
  await B.page.evaluate(`history.pushState({}, '', '/purchasing/requisitions'); dispatchEvent(new PopStateEvent('popstate'))`);
  await B.page.waitFor(`location.pathname === '/purchasing/requisitions' && document.body.innerText.includes('PR-0000')`, { timeout: 20_000 });
  const buy = await film(B.page, join(out, 'take-buy'), async ({ onEvent }) => {
    const s = stage(B.page, { pace, onEvent, captions: false, log: (t) => t && console.log('  agent:', t) });
    s.mark('scene', { n: 4 });
    await mizan.goTo(s, '/purchasing/requisitions', { explain: 'في الحسابات: طلبات الشراء وصلت من المصنع، كل واحد ليه موردّه المعتاد', ready: `location.pathname === '/purchasing/requisitions' && document.body.innerText.includes('PR-0000')` });
    const mine = (await mz('GET', '/api/purchase-requisitions')).filter((r) => r.status === 'open');
    if (mine.length !== 4) throw new Error('Mizan holds ' + mine.length + ' open requisitions');
    s.mark('proven', { what: 'requisitions arrived', n: mine.length });
    await s.wait(5200);
    const bySupplier = (name) => mine.filter((r) => (r.supplier_name ?? '').includes(name)).map((r) => r.number);
    pos.push(await mizan.convertToPurchaseOrder(s, mz, { numbers: bySupplier('أسوان'), explain: 'الطفلة والفلسبار من نفس المورد: بحوّلهم لأمر شراء واحد',
      supplierNote: 'أمر مسوّدة بسطر لكل طلب، وكل سطر ماسك رابط طلبه. المسؤول هو اللي بيعتمد',
      doneSay: (p) => `الأمر اتعتمد: ${p.number}، سطرين، وطلبات الشراء بقت "على أمر شراء"` }));
    await s.wait(3000);
    pos.push(await mizan.convertToPurchaseOrder(s, mz, { numbers: bySupplier('الفريت'), explain: 'والجليز والكراتين من المورد التاني: نفس الخطوات',
      doneSay: (p) => `الأمر التاني اتعتمد: ${p.number}` }));
    await s.wait(2600);
    await mizan.goTo(s, '/purchasing/orders', { explain: 'أوامر الشراء الاتنين معتمدين وفي طريقهم للموردين', ready: `location.pathname === '/purchasing/orders' && document.body.innerText.includes(${JSON.stringify(pos[0].number)})` });
    s.mark('proven', { what: 'orders listed', n: pos.length });
    await s.wait(6000);
    s.mark('done');
    return { pos: pos.length, lines: pos.map((p) => p.lines.length), numbers: pos.map((p) => p.number) };
  });
  console.log('ok  buy take:', JSON.stringify(buy.result), `${(buy.duration / 1000).toFixed(1)} s`);
  await B.b.close();

  // ------------------------------------------------------------------------------ the goods arrive (staged through Mizan's receipt API)
  const main = (await mz('GET', '/api/inventory/warehouses')).find((w) => w.is_default);
  const lotOf = { [world.ids.clay]: 'CL-2610', [world.ids.feldspar]: 'FS-2610', [world.ids.glaze]: 'GZ-2610', [world.ids.carton]: 'CT-2610' };
  for (const p of pos) {
    const v = await mz('GET', `/api/purchase-orders/${p.id}`);
    const gr = await mz('POST', '/api/inventory/receipts', { supplierId: v.supplier_id, poId: p.id, date: world.day(), warehouseId: main.id, post: true,
      lines: v.lines.map((l) => ({ itemId: l.item_id, quantity: l.quantity, unitCost: l.unit_price, poLineId: l.id, lots: [{ lotNo: lotOf[l.item_id], qty: l.base_quantity ?? l.quantity }] })) });
    if (!gr.id) throw new Error('the receipt was refused');
  }
  await world.pump();

  // ------------------------------------------------------------------------------ take 3: the lots in the factory (Itqan)
  const C = await openApp('browser-recv', h.urls.gmes, gmesIn);
  await C.page.evaluate(`location.hash = '#PLN2050'`);
  await C.page.waitFor(`location.hash === '#PLN2050' && document.body.innerText.includes('CLAY-RED')`, { timeout: 20_000 });
  const recv = await film(C.page, join(out, 'take-recv'), async ({ onEvent }) => {
    const s = stage(C.page, { pace, onEvent, captions: false, log: (t) => t && console.log('  agent:', t) });
    await s.wait(1800);
    s.mark('scene', { n: 5 });
    await s.say('الموردين سلّموا، والاستلام اتسجّل في الحسابات. نروح للمصنع: المواد الواردة');
    await gmes.goTo(s, 'QMS2040', { ready: `location.hash === '#QMS2040' && document.body.innerText.includes('CL-2610')` });
    const lots = await gm('GET', '/api/qms/incoming-lots');
    if (lots.length !== 4) throw new Error('Itqan holds ' + lots.length + ' incoming lots');
    const st = Object.fromEntries(lots.map((l) => [l.item_code, l.status]));
    if (st['CLAY-RED'] !== 'pending_iqc' || st['GLZ-WHT'] !== 'pending_iqc' || st.FELDSPAR !== 'accepted' || st['CTN-60'] !== 'accepted') throw new Error('unexpected lot statuses ' + JSON.stringify(st));
    s.mark('proven', { what: 'lots arrived', n: lots.length, statuses: lots.map((l) => `${l.item_code}:${l.status}`) });
    await s.say('الأربع دفعات ظهرت بلوطاتها ومورديها ورقم الاستلام. الطفلة والجليز مستنيين الفحص، والفلسبار والكراتين متاحين. ودفعة مستنية الفحص ماتتحملش على الخط');
    await s.wait(8500);
    s.mark('done');
    return { lots: lots.length, statuses: lots.map((l) => `${l.item_code}:${l.status}`).sort() };
  });
  console.log('ok  recv take:', JSON.stringify(recv.result), `${(recv.duration / 1000).toFixed(1)} s`);
  await C.b.close(); await A.b.close();
} catch (e) {
  console.error('FAIL', e.stack ?? e.message);
  process.exitCode = 1;
} finally {
  await world?.stop().catch(() => {});
  process.exit(process.exitCode ?? 0);
}
