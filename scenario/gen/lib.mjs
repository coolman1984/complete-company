// Shared helpers for the scenario generator: dates, deterministic randomness, rounding. No dependencies.
export const SEED = 20260929;

// ---------------------------------------------------------------- dates (ISO strings, UTC arithmetic, no time zones)
const MS = 86400000;
export const toMs = (s) => Date.parse(s + 'T00:00:00Z');
export const fromMs = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (s, n) => fromMs(toMs(s) + n * MS);
export const diffDays = (a, b) => Math.round((toMs(a) - toMs(b)) / MS);   // a - b
export const dow = (s) => new Date(toMs(s)).getUTCDay();                // 0 = Sunday ... 5 = Friday, 6 = Saturday
export const DOWNAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const dayName = (s) => DOWNAME[dow(s)];
export function* dates(a, b) { for (let x = a; x <= b; x = addDays(x, 1)) yield x; }
export const dateList = (a, b) => [...dates(a, b)];
export const month = (s) => s.slice(0, 7);
export const monthStart = (m) => m + '-01';
export function monthEnd(m) { const [y, mo] = m.split('-').map(Number); return fromMs(Date.UTC(y, mo, 0)); }
export function addMonths(m, n) { const [y, mo] = m.split('-').map(Number); const t = y * 12 + (mo - 1) + n; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`; }
export const monthsBetween = (a, b) => { const out = []; for (let m = a; m <= b; m = addMonths(m, 1)) out.push(m); return out; };
// week key: weeks run Saturday..Friday (Egyptian week, Friday is the rest day); key = ISO date of the Saturday
export const weekStart = (s) => addDays(s, -((dow(s) + 1) % 7));

// ---------------------------------------------------------------- calendar
export const WINDOW = { from: '2026-07-01', to: '2026-09-28' };
export const TODAY = '2026-09-29';
export const OPENING = '2026-06-30';
export const HISTORY_FROM = '2026-02-01';   // sales history for opening receivables
export const PLAN_TO = '2026-12-31';
export const HOLIDAYS = {
  '2026-06-30': 'June 30 Revolution Day',
  '2026-07-23': 'Revolution Day (23 July)',
  '2026-08-26': "Prophet's Birthday (Mawlid) - lunar date [E], confirm with the official announcement",
  '2026-10-06': 'Armed Forces Day (6 October)',
};
export const isWork = (s) => dow(s) !== 5 && !HOLIDAYS[s];           // Friday rest + public holidays
export const isBank = (s) => dow(s) !== 5 && dow(s) !== 6 && !HOLIDAYS[s];   // banks: Sunday-Thursday
export const nextWork = (s) => { while (!isWork(s)) s = addDays(s, 1); return s; };
export const prevWork = (s) => { while (!isWork(s)) s = addDays(s, -1); return s; };
export const nextBank = (s) => { while (!isBank(s)) s = addDays(s, 1); return s; };
export const prevBank = (s) => { while (!isBank(s)) s = addDays(s, -1); return s; };
export function addWork(s, n) { s = nextWork(s); let k = 0; while (k < n) { s = addDays(s, 1); if (isWork(s)) k++; } return s; }
export function addBank(s, n) { s = nextBank(s); let k = 0; while (k < n) { s = addDays(s, 1); if (isBank(s)) k++; } return s; }
export const workdays = (a, b) => dateList(a, b).filter(isWork);

// ---------------------------------------------------------------- deterministic randomness
// Every random-looking number is a pure function of a string key: U(key...) = FNV-1a 32 bit of the '|'-joined key / 2^32.
export function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i) & 0xff; h = Math.imul(h, 0x01000193) >>> 0; if (str.charCodeAt(i) > 255) { h ^= str.charCodeAt(i) >> 8; h = Math.imul(h, 0x01000193) >>> 0; } }
  return h >>> 0;
}
export const U = (...k) => fnv1a32([SEED, ...k].join('|')) / 4294967296;
export const N01 = (...k) => { const a = Math.max(1e-9, U(...k, 'a')), b = U(...k, 'b'); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); };
export const pick = (arr, ...k) => arr[Math.floor(U(...k) * arr.length) % arr.length];

// ---------------------------------------------------------------- numbers
export const rint = (x) => Math.round(x + (x >= 0 ? 1e-9 : -1e-9));
export const r2 = (x) => Math.round((x + (x >= 0 ? 1e-9 : -1e-9)) * 100) / 100;
export const r4 = (x) => Math.round((x + 1e-12) * 10000) / 10000;
export const cents = (x) => rint(x * 100);            // money -> integer minor units (piastres / cents)
export const sum = (a, f = (x) => x) => a.reduce((s, x) => s + f(x), 0);
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const pad = (n, w) => String(n).padStart(w, '0');
export const groupBy = (a, f) => { const m = new Map(); for (const x of a) { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
