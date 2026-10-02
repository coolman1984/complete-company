// Proves the running showreel from the outside, exactly as the owner would use it: signs in to Mizan, Itqan and HR-System with admin / 123
// and reads what each says about the company, then runs the cross-system verifier over the three live applications.
//   node scenario/ceramic/showreel-check.mjs [--mizan URL] [--gmes URL] [--hr URL]      exit code 1 when something is wrong
import { session } from '../../portal/pair.mjs';
import { verify, printReport } from '../verify/verify.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const urls = { mizan: arg('--mizan', 'http://127.0.0.1:4810'), gmes: arg('--gmes', 'http://127.0.0.1:4701'), hr: arg('--hr', 'http://127.0.0.1:8790') };
const mizan = session(urls.mizan, 'mizan_sid', 120_000), gmes = session(urls.gmes, 'gmes_sid', 120_000), hr = session(urls.hr, 'hr_sid', 120_000);
mizan.base = urls.mizan; gmes.base = urls.gmes; hr.base = urls.hr;
let failed = 0;
const line = (ok, what, detail = '') => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? '  ' + detail : ''}`); if (!ok) failed++; };
const money = (minor) => (minor / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

for (const [name, login] of [['Mizan', () => mizan('POST', '/api/auth/login', { username: 'admin', password: '123' })], ['Itqan', () => gmes('POST', '/api/auth/login', { login: 'admin', password: '123' })], ['HR-System', () => hr('POST', '/api/login', { username: 'admin', password: '123' })]]) {
  try { await login(); line(true, `${name}: admin / 123 signs in`); } catch (e) { line(false, `${name}: admin / 123 signs in`, e.message); }
}
if (failed) process.exit(1);
try {
  const company = (await mizan('GET', '/api/eco/company')).companyId;
  const items = await mizan('GET', '/api/items'); const itemRows = Array.isArray(items) ? items : items.rows;
  const orders = await mizan('GET', '/api/sales/orders?limit=1'); const deliveries = await mizan('GET', '/api/sales/deliveries?limit=1');
  const tb = await mizan('GET', '/api/reports/trial-balance?from=2026-01-01&to=2026-12-31');
  line(itemRows.length >= 14, 'Mizan holds the company', `${itemRows.length} items, ${orders.total ?? orders.rows?.length} sales orders, ${deliveries.total ?? deliveries.rows?.length} deliveries, trial balance ${tb.balanced ? 'balanced' : 'NOT balanced'} (${money(tb.totals.debit)} EGP each side)`);
  const periods = await mizan('GET', '/api/payroll/hr-periods');
  line(periods.length >= 3 && periods.every((p) => p.status === 'booked' && p.entries.length > 0), 'Mizan booked the pay HR calculated', periods.map((p) => `${p.period} ${p.headcount} people ${p.entries.length} entries ${money(p.total)}`).join('; '));
  const wos = await gmes('GET', '/api/work-orders'); const lots = await gmes('GET', '/api/qms/incoming-lots');
  line(wos.length > 50, 'Itqan holds the production', `${wos.length} work orders, ${lots.length} incoming lots`);
  const emps = (await hr('GET', '/api/employee')).filter((e) => e.employment_status === 'Active');
  const runs = await hr('GET', '/api/payroll/runs');
  line(emps.length >= 150 && runs.length >= 3, 'HR holds the people and the pay', `${emps.length} active employees; pay runs ${runs.map((r) => `${r.period} ${r.status} (${r.delivery?.state})`).join(', ')}`);
  const me = await hr('GET', '/api/me');
  line(me.permissions.includes('hr.payroll.approve'), 'HR admin may approve a pay run', `${me.permissions.length} rights`);
} catch (e) { line(false, 'reading the applications', e.message); }

console.log('verify');
const report = await verify({ mizan, gmes, hr, day: new Date().toISOString().slice(0, 10) });
printReport(report);
failed += report.checks.filter((c) => !c.ok).length;
console.log(failed ? `SHOWREEL CHECK: ${failed} problem(s)` : 'SHOWREEL CHECK: PASSED');
process.exit(failed ? 1 : 0);
