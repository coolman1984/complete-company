// Looks at the running showreel the way the owner will: opens Google Chrome (its own profile, headless), signs in to Mizan, Itqan and HR-System with
// admin / 123, visits their screens one by one and records, for each: did it open, how much it shows, did the page raise an error, and a screenshot.
//   node scenario/ceramic/ui-review.mjs [--out DIR] [--only mizan|gmes|hr] [--visible]      exit code 1 when a screen fails
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { launch } from '../../agent/cdp.mjs';
import { session } from '../../portal/pair.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const out = resolve(arg('--out', join(tmpdir(), 'ceramic-ui-review')));
const only = arg('--only', null);
mkdirSync(out, { recursive: true });
const URLS = { mizan: 'http://127.0.0.1:4810', gmes: 'http://127.0.0.1:4701', hr: 'http://127.0.0.1:8790' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ids of real records, read from the applications themselves, so the detail screens are opened on data that exists
const mz = session(URLS.mizan, 'mizan_sid', 60_000);
await mz('POST', '/api/auth/login', { username: 'admin', password: '123' });
const firstSo = (await mz('GET', '/api/sales/orders?limit=1')).rows[0]?.id;
const firstDl = (await mz('GET', '/api/sales/deliveries?limit=1')).rows[0]?.id;
const firstJe = (await mz('GET', '/api/journal?limit=1')).rows?.[0]?.id;
const firstPo = (await mz('GET', '/api/purchase-orders?limit=1')).rows?.[0]?.id;
const sopCycles = await mz('GET', '/api/sop/cycles');
const firstVersion = sopCycles.length ? (await mz('GET', `/api/sop/cycles/${sopCycles[0].id}`)).versions?.[0]?.id : null;
const firstMfg = (await mz('GET', '/api/mfg/gmes-wip?limit=1'))[0]?.code;

const SCREENS = {
  mizan: [
    ['/', 'home', 'Demo Ceramics'], ['/sales/orders', 'sales orders', 'SO-00'], [`/sales/orders/${firstSo}`, 'a sales order', 'SO-00'], ['/sales/orders/new', 'new sales order', null],
    ['/sales/deliveries', 'deliveries', 'DLV-00'], [`/sales/deliveries/${firstDl}`, 'a delivery', 'DLV-00'], ['/sales/invoices', 'invoices', 'INV-'],
    ['/reports/sales/otif', 'delivery performance', null], ['/reports/sales/backlog', 'order backlog', null], ['/reports/sales/analysis', 'sales and margin', null],
    ['/sop', 'S&OP cycles', '2026'], [`/sop/versions/${firstVersion}`, 'S&OP plan', 'TL-'], ['/kpi', 'KPI pack', 'TL-'],
    ['/payroll/hr', 'payroll from HR', '2026'], ['/mfg/itqan', 'production from Itqan', 'WO-'],
    ['/purchasing/orders', 'purchase orders', 'PO-'], [`/purchasing/orders/${firstPo}`, 'a purchase order', 'PO-'], ['/purchasing/requisitions', 'requisitions', null],
    ['/inventory', 'inventory', null], ['/inventory/receipts', 'goods receipts', null], ['/items', 'items', 'TL-6060'], ['/customers', 'customers', 'Delta'], ['/suppliers', 'suppliers', 'Aswan'],
    ['/journal', 'journal', 'JE-'], [`/journal/${firstJe}`, 'a journal entry', 'JE-'], ['/reports/trial-balance', 'trial balance', null], ['/reports/income-statement', 'income statement', null],
    ['/reports/balance-sheet', 'balance sheet', null], ['/reports/cost-centers', 'cost-centre report', 'CC-'], ['/cost-centers', 'cost centres', 'CC-'], ['/reports/aging/receivable', 'receivables ageing', null],
    ['/integration', 'integration', null], ['/advisor', 'advisor', null], ['/system/health', 'system health', null],
  ],
  gmes: [
    ['PLN1020', 'sales orders (planning)', null], ['PLN1030', 'planning', null], ['PLN1040', 'planned orders', null], ['PLN1050', 'requisitions', null], ['PLN2010', 'plan', null], ['EXE2010', 'release plan', null],
    ['EXE3010', 'work orders', null], ['EXE3020', 'work order', null], ['WIP3010', 'work in progress', null], ['QMS2020', 'incoming inspection', null], ['RPT4020', 'losses', null], ['RPT4010', 'production report', null],
    ['OEE2010', 'stoppages', null], ['SHP2010', 'shipping', null], ['DSH5010', 'line board', null], ['TRC3010', 'traceability', null], ['MDM1010', 'items', null], ['MDM1030', 'plant', null], ['SYS9100', 'health', null],
  ],
  hr: [
    ['HOME', 'dashboard', null], ['EMP1010', 'employees', 'E0000'], ['ORG1010', 'structure', null], ['ORG1030', 'positions', null], ['SHF3010', 'roster', null], ['SHF3020', 'plan against attendance', null], ['STF2010', 'staffing gap', null],
    ['REC1010', 'headcount plan', null], ['REC1020', 'requisitions', null], ['REC1030', 'candidates', null], ['OVT1010', 'overtime', null], ['OVT1020', 'overtime figures', null], ['LEV2010', 'leave', null], ['LEV3010', 'leave balance', null],
    ['TRN2010', 'training', null], ['SKL3010', 'skills matrix', null], ['DSC2010', 'violations', null], ['PAY2010', 'pay runs', '2026-'], ['PAY1010', 'salary profiles', 'E0000'], ['PAY1020', 'pay adjustments', null],
    ['ADV1010', 'advisor', null], ['SEC9010', 'users', 'admin'], ['SYS9060', 'settings', null], ['SYS9070', 'backups', null], ['SYS9100', 'health', null],
  ],
};

const browser = await launch({ profileDir: join(tmpdir(), `ceramic-review-profile-${Date.now()}`), headless: !process.argv.includes('--visible'), width: 1600, height: 900 });
const page = await browser.open('about:blank', { left: 0, top: 0, width: 1600, height: 900 });
await page.send('Log.enable');
let errors = [];
page.conn.listeners.add((m) => {
  if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).split('\n')[0]);
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon/.test(m.params.entry.url ?? '')) errors.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ''}`.slice(0, 220));
});

const setLogin = (user, pass) => `(() => {
  const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  const pw = document.querySelector('input[type=password]'); if (!pw) return 'no password field';
  const root = pw.closest('form') ?? document;
  const u = [...root.querySelectorAll('input')].find((i) => i !== pw && !['checkbox', 'hidden', 'radio'].includes(i.type));
  set(u, ${JSON.stringify(user)}); set(pw, ${JSON.stringify(pass)});
  const form = pw.closest('form');
  if (form) form.requestSubmit(); else [...document.querySelectorAll('button')].find((b) => /sign|login|دخول|تسجيل/i.test(b.textContent))?.click();
  return 'submitted';
})()`;

const report = [];
let failed = 0;
for (const app of Object.keys(SCREENS)) {
  if (only && only !== app) continue;
  errors = [];
  await page.goto(URLS[app] + '/');
  await page.waitFor(`document.readyState === 'complete' && document.body.innerText.length > 20`, { timeout: 30_000 });
  await sleep(600);
  const r = await page.evaluate(setLogin('admin', '123'));
  if (r !== 'submitted') { report.push({ app, screen: 'sign in', ok: false, detail: r }); failed++; continue; }
  const signedIn = await page.waitFor(`!document.querySelector('input[type=password]')`, { timeout: 30_000 }).then(() => true).catch(() => false);
  report.push({ app, screen: 'sign in with admin / 123', ok: signedIn, detail: signedIn ? '' : 'the sign-in screen is still showing' });
  if (!signedIn) { failed++; await page.screenshot(join(out, `${app}-login-failed.png`)); continue; }
  await sleep(1500);
  for (const [where, name, expect] of SCREENS[app]) {
    errors = [];
    const hash = app !== 'mizan';
    // the product shells keep at most ten screens open: each screen is opened on a fresh shell (the session cookie keeps the sign-in)
    if (hash) {
      await page.evaluate(`try { for (const k of Object.keys(localStorage)) if (/tab|open|screen|layout|workspace/i.test(k)) localStorage.removeItem(k); sessionStorage.clear(); } catch {}`);
      await page.goto('about:blank'); await page.goto(URLS[app] + '/#' + where);
      await page.waitFor(`document.body && document.body.innerText.length > 100`, { timeout: 25_000 }).catch(() => {});
    }
    else await page.goto(URLS[app] + where);
    await sleep(hash ? 1500 : 1200);
    await page.waitFor(`document.readyState === 'complete'`, { timeout: 20_000 }).catch(() => {});
    // wait for the loading state to settle (spinners and "Loading" texts go away)
    await page.waitFor(`!document.querySelector('.spinner, .skeleton, [aria-busy=true]') && !/Loading|جارٍ التحميل/.test(document.body.innerText)`, { timeout: 25_000 }).catch(() => {});
    await sleep(500);
    const info = await page.evaluate(`(() => { const t = document.body.innerText; return { len: t.length, text: t.slice(0, 6000), title: document.title,
      bad: /something went wrong|unexpected error|حصل خطأ|not found|404/i.test(t.slice(0, 1500)) && t.length < 600 }; })()`);
    const missing = expect && !info.text.includes(expect) ? `expected to see "${expect}"` : '';
    const ok = info.len > 150 && !info.bad && !errors.length && !missing;
    if (!ok) failed++;
    const shot = `${app}-${where.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'home'}.png`;
    await page.screenshot(join(out, shot));
    report.push({ app, screen: name, where, ok, shows: info.len, detail: [missing, info.bad ? 'an error page' : '', ...errors.slice(0, 3)].filter(Boolean).join(' | '), screenshot: shot });
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${app.padEnd(5)} ${name}${ok ? '' : '  ' + report.at(-1).detail}`);
  }
}
await browser.close();
writeFileSync(join(out, 'ui-review.json'), JSON.stringify({ at: new Date().toISOString(), failed, screens: report }, null, 1));
console.log(failed ? `UI REVIEW: ${failed} problem(s) (screenshots and ui-review.json in ${out})` : `UI REVIEW: PASSED, ${report.length} screens (screenshots in ${out})`);
process.exit(failed ? 1 : 0);
