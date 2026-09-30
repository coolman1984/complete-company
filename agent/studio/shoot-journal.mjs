// Films the journal scene twice against a running Mizan (presentation pace, then full speed) into ..\..\..\_agent-film,
// ready for render.mjs. Mizan must be freshly set up (the demo), because the entry number and the report are part of it.
//   node agent/studio/shoot-journal.mjs          (MIZAN_URL, MIZAN_USER, MIZAN_PASSWORD as in try-journal.mjs)
//   then: set FFMPEG_PATH=C:\path\to\ffmpeg.exe
//         node agent/studio/render.mjs ..\_agent-film\take-show ..\_agent-film\take-fast ..\_agent-film\film.mp4
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../cdp.mjs';
import { stage } from '../stage.mjs';
import { signIn, recordJournal, openScreen } from '../skills/mizan.mjs';
import { film } from './record.mjs';

const M = process.env.MIZAN_URL ?? 'http://127.0.0.1:4810';
const login = { user: process.env.MIZAN_USER ?? 'admin', password: process.env.MIZAN_PASSWORD ?? 'Demo-2026!' };
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../../_agent-film');
let cookie = '';
const api = async (m, p, b) => {
  const r = await fetch(M + p, { method: m, headers: { 'content-type': 'application/json', origin: M, ...(cookie ? { cookie } : {}) }, body: b ? JSON.stringify(b) : undefined });
  const s = r.headers.get('set-cookie'); if (s) cookie = s.split(';')[0];
  const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p}: ${r.status} ${t.slice(0, 200)}`); return t ? JSON.parse(t) : null;
};
await api('POST', '/api/auth/login', { username: login.user, password: login.password });

for (const [take, pace] of [['take-show', 1], ['take-fast', 0]]) {
  const b = await launch({ profileDir: join(out, 'browser-' + take), headless: true });
  try {
    const page = await b.open(M + '/', { left: 0, top: 0, width: 1600, height: 1000, scale: 1.5 });
    await page.send('Network.enable').catch(() => {});
    await page.waitFor(`!!document.querySelector('input[type=password]') || !!document.querySelector('nav')`);
    const f = await film(page, join(out, take), async ({ onEvent }) => {
      const s = stage(page, { pace, onEvent, captions: false });
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
      await s.waitText('185');
      s.mark('done');
      await s.wait(1800);
      return { number: entry.number };
    });
    console.log(`ok  ${take}: ${f.frames.length} frames, ${(f.duration / 1000).toFixed(1)} s, entry ${f.result.number}`);
  } finally { await b.close(); }
}
