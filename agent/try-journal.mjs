// First proof of the stage: the agent records and posts one expense in Mizan's real screens, in a Chrome window you can
// watch (the demo's own profile folder, never your personal Chrome), then shows the income statement.
// Mizan must be running (for example Start-Ceramic-Demo.bat, which uses port 4810).
//   node agent\try-journal.mjs                       (visible window, presentation pace)
//   set MIZAN_URL=http://127.0.0.1:4810 & set MIZAN_USER=admin & set MIZAN_PASSWORD=Demo-2026!   (the defaults)
//   set AGENT_HEADLESS=1 / AGENT_PACE=0              (no window / as fast as possible, for checks)
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';
import { stage } from './stage.mjs';
import { signIn, recordJournal, openScreen } from './skills/mizan.mjs';

const M = process.env.MIZAN_URL ?? 'http://127.0.0.1:4810';
const login = { user: process.env.MIZAN_USER ?? 'admin', password: process.env.MIZAN_PASSWORD ?? 'Demo-2026!' };
const here = dirname(fileURLToPath(import.meta.url));
let cookie = '';
const api = async (m, p, b) => {
  const r = await fetch(M + p, { method: m, headers: { 'content-type': 'application/json', origin: M, ...(cookie ? { cookie } : {}) }, body: b ? JSON.stringify(b) : undefined });
  const s = r.headers.get('set-cookie'); if (s) cookie = s.split(';')[0];
  const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p}: ${r.status} ${t.slice(0, 200)}`); return t ? JSON.parse(t) : null;
};

const b = await launch({ profileDir: join(here, '..', '..', '_agent-browser'), headless: process.env.AGENT_HEADLESS === '1' });
const t0 = Date.now();
let page;
try {
  await api('POST', '/api/auth/login', { username: login.user, password: login.password });
  page = await b.open(M + '/', { left: 0, top: 0, width: 1440, height: 900 });
  await page.waitFor(`!!document.querySelector('input[type=password]') || !!document.querySelector('nav')`);
  const s = stage(page, { pace: Number(process.env.AGENT_PACE ?? 1), log: (t) => t && console.log('  agent:', t) });
  if (await page.evaluate(`!!document.querySelector('input[type=password]')`)) await signIn(s, login);
  const entry = await recordJournal(s, api, {
    explain: 'وصلت فاتورة كهرباء الأفران لشهر سبتمبر: ١٨٥٬٠٠٠ جنيه. بسجّلها مصروف مستحق',
    reference: 'كهرباء-2609', memo: 'كهرباء خط الأفران - سبتمبر ٢٠٢٦',
    lines: [
      { account: '5230', option: '5230', debit: '185000', say: 'مدين: مصروف الكهرباء والمرافق (٥٢٣٠)' },
      { account: '2130', option: '2130', credit: '185000', say: 'دائن: مصروفات مستحقة (٢١٣٠) لحد ما تتدفع' },
    ],
  });
  await s.say('ودي قائمة الدخل بعد القيد: المصروف ظهر في مكانه');
  await openScreen(s, 'قائمة الدخل', { waitFor: `location.pathname.includes('income')` });
  console.log(`ok  posted ${entry.number} (checked through Mizan's API) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (process.env.AGENT_HEADLESS !== '1') await new Promise((r) => setTimeout(r, 8000)); // leave the result on screen a moment
} catch (e) {
  console.error('FAIL', e.message);
  // an unattended failure leaves nothing else to diagnose from: keep what was on screen
  if (page) { const shot = join(here, '..', '..', '_agent-failure.png'); try { await page.screenshot(shot); console.error('     screen at the failure:', shot); } catch { /* browser gone */ } }
  process.exitCode = 1;
} finally {
  await b.close();
}
