// Film 3: the invoice, the collection and the month-end review in Mizan, filmed the way film 2 was (a still camera, whole
// screens, the reports held long enough to read). The demo ceramic company (invented) has a quarter of history built through
// Mizan's API (sets/mizan-ceramic-quarter.mjs); on camera the agent invoices the distributor for the tiles, records the
// distributor's transfer against August's invoice, books September's depreciation, then reviews the dashboard and the statements.
//   cd Accounting-sys && npm run build      (once: the film runs the built server and serves the built screens)
//   node agent/studio/shoot-month-end.mjs
// Then: node agent/studio/render.mjs --cut agent/studio/cuts/month-end.json --take books=..\_agent-film\take-books <out.mp4>
// What is staged: the clock (30 September 2026, 16:00) and the quarter's history, both through Mizan's own API.
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from '../cdp.mjs';
import { stage } from '../stage.mjs';
import * as mizan from '../skills/mizan.mjs';
import { film } from './record.mjs';
import { seedCeramicQuarter } from './sets/mizan-ceramic-quarter.mjs';
import { makeClock } from '../../scenario/engine/clock.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const out = join(root, '_agent-film');
const pace = Number(process.env.AGENT_PACE ?? 1);
const view = { width: 1600, height: 1000, scale: 1.5, timezone: 'Africa/Cairo' };
const egp = (piastres) => (piastres / 100).toLocaleString('ar-EG', { maximumFractionDigits: 0 });
let app;

try {
  for (const d of ['mizan-data', 'take-books', 'browser-books']) rmSync(join(out, d), { recursive: true, force: true });
  mkdirSync(join(out, 'mizan-data'), { recursive: true });
  process.env.MIZAN_SESSION_HOURS = '200000';
  const dist = join(root, 'Accounting-sys', 'apps', 'server', 'dist');
  const { buildApp } = await import(pathToFileURL(join(dist, 'app.js')).href);
  const { loadConfig } = await import(pathToFileURL(join(dist, 'config.js')).href);
  const clock = makeClock('2026-09-30', '16:00');
  app = await buildApp(loadConfig({ dataDir: join(out, 'mizan-data'), dbFile: join(out, 'mizan-data', 'mizan.db'), logLevel: 'silent', webDir: join(root, 'Accounting-sys', 'apps', 'web', 'dist'), host: '127.0.0.1', port: 0 }), undefined, { clock });
  await app.http.listen({ host: '127.0.0.1', port: 0 });
  const M = `http://127.0.0.1:${app.http.server.address().port}`;
  let cookie = '';
  const api = async (m, p, b) => { const r = await fetch(M + p, { method: m, headers: { 'content-type': 'application/json', origin: M, ...(cookie ? { cookie } : {}) }, body: b === undefined ? (m === 'GET' ? undefined : '{}') : JSON.stringify(b) }); const s = r.headers.get('set-cookie'); if (s && s.startsWith('mizan_sid=')) cookie = s.split(';')[0]; const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p} ${r.status} ${t.slice(0, 300)}`); return t ? JSON.parse(t) : null; };
  await api('POST', '/api/setup', { company: { name: 'شركة السيراميك التجريبية', baseCurrency: 'EGP', moneyScale: 2 }, fiscalYearStart: '2026-01-01', admin: { username: 'admin', displayName: 'المدير المالي', password: 'Demo-2026!' }, locale: 'ar', seedChartOfAccounts: true, vatRateBp: 1400 });
  await api('POST', '/api/auth/login', { username: 'admin', password: 'Demo-2026!' });
  const { party } = await seedCeramicQuarter({ get: (p) => api('GET', p), post: (p, b) => api('POST', p, b), put: (p, b) => api('PUT', p, b) });
  const august = (await api('GET', `/api/payments/open-documents?partyId=${party['C-DELTA']}&direction=in&role=customer`)).sort((a, b) => a.date.localeCompare(b.date))[0];

  const b = await launch({ profileDir: join(out, 'browser-books'), headless: true });
  const page = await b.open('about:blank', view);
  // the browser reads the studio date (the default dates of the forms and of the depreciation month)
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const o = ${clock.now().getTime() - Date.now()}; const R = Date; class D extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + o); } static now() { return R.now() + o; } } window.Date = D; })();` });
  await page.goto(M + '/');
  await page.waitFor(`!!document.querySelector('input[type=password]')`, { timeout: 20_000 });
  await mizan.signIn(stage(page, { pace: 0, captions: false }), { user: 'admin', password: 'Demo-2026!' });
  await page.waitFor(`document.body.innerText.includes('لوحة التحكم')`, { timeout: 20_000 });

  const books = await film(page, join(out, 'take-books'), async ({ onEvent }) => {
    const s = stage(page, { pace, onEvent, captions: false, log: (t) => t && console.log('  agent:', t) });
    await s.wait(1000);
    // ---- scene 06: the invoice
    s.mark('scene', { n: 6 });
    const inv = await mizan.createSalesInvoice(s, api, {
      customer: 'الدلتا', customerOption: 'الدلتا لمواد البناء',
      lines: [{ item: 'TL-6060-WHT', qty: 1300, say: 'السطر: ١٬٣٠٠ م² بورسلين ٦٠×٦٠ أبيض، لوط S07-C2. السعر والضريبة من كارت الصنف' }],
      explain: 'البلاط اتسلم للموزع: بعمل فاتورة المبيعات للدلتا لمواد البناء',
      doneSay: (d) => `الفاتورة اترحّلت: ${d.number}، الإجمالي ${egp(d.total)} جنيه شامل ضريبة القيمة المضافة ١٤٪`,
    });
    await s.wait(2500);
    // ---- scene 07: the collection
    s.mark('scene', { n: 7 });
    const pay = await mizan.receivePayment(s, api, {
      party: 'الدلتا', partyOption: 'الدلتا لمواد البناء', amount: (august.outstanding / 100).toFixed(2),
      explain: `الدلتا حوّلت فلوس فاتورة ${august.number}: بسجّل التحصيل على البنك وبطبّقه على الفاتورة`,
      doneSay: (p) => `التحصيل اترحّل: ${p.number}، ${egp(p.amount)} جنيه، والفاتورة اتقفلت`,
    });
    await s.wait(2500);
    // ---- scene 08: month-end review
    s.mark('scene', { n: 8 });
    s.mark('wide');
    await mizan.runDepreciation(s, api, { month: '2026-09', explain: 'آخر الشهر: بسجّل إهلاك سبتمبر للأفران والخطوط والمباني في قيد واحد',
      doneSay: () => 'الإهلاك اتسجل في قيد واحد، ومش هيتكرر لنفس الشهر' });
    await s.wait(2500);
    await mizan.openReport(s, 'لوحة التحكم', '/', { explain: 'لوحة التحكم: البنك والعملاء والموردين وربح الشهر، والإيرادات قدام المصروفات', ready: `!!document.querySelector('svg') && document.body.innerText.includes('ربح')` });
    await s.wait(5000);
    await mizan.openReport(s, 'قائمة الدخل', '/reports/income-statement', { explain: 'قائمة الدخل للربع: المبيعات وتكلفتها ومجمل الربح والمصروفات وصافي الربح', range: 'هذا الربع' });
    await s.wait(4000);
    await page.evaluate('window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })');
    await s.wait(3500);
    await mizan.openReport(s, 'الميزانية العمومية', '/reports/balance-sheet', { explain: 'والميزانية في آخر سبتمبر: الأصول = الخصوم + حقوق الملكية', ready: `document.body.innerText.includes('متوازن')` });
    await s.wait(5000);
    const is = await api('GET', '/api/reports/income-statement?from=2026-07-01&to=2026-09-30');
    const bs = await api('GET', '/api/reports/balance-sheet?asOf=2026-09-30').catch(() => null);
    s.mark('done');
    return { invoice: inv.number, invoiceTotal: inv.total, receipt: pay.number, receiptAmount: pay.amount, revenue: is.totals.revenue, netProfit: is.totals.netProfit ?? is.totals.operatingProfit, balanced: bs ? (bs.balanced ?? null) : null };
  });
  console.log('ok  books take:', JSON.stringify(books.result), `${(books.duration / 1000).toFixed(1)} s`);
  await b.close();
} catch (e) {
  console.error('FAIL', e.stack ?? e.message);
  process.exitCode = 1;
} finally {
  await app?.close?.().catch?.(() => {});
  process.exit(process.exitCode ?? 0);
}
