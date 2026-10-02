// Mizan skills: what the agent can do in Mizan's own screens, each step shown on the stage, each result read back
// through Mizan's API before the skill reports success (a screen that "looked right" is not proof).
// Screen words are Mizan's Arabic interface (the demo runs in Arabic); they are the labels a person reads.

/** Signs in through the sign-in screen. */
export async function signIn(s, { user, password }) {
  await s.say('بفتح برنامج الحسابات وبسجّل دخول باسم المستخدم بتاعي');
  await s.fill({ css: 'input:not([type=password]):not([type=checkbox])' }, user);
  await s.fill({ css: 'input[type=password]' }, password, { cps: 30 });
  await s.key('Enter');
  await s.page.waitFor(`!document.querySelector('input[type=password]')`);
}

/** Opens a screen from the side menu by its name, the way a person would. */
export async function openScreen(s, name, { waitFor } = {}) {
  await s.click({ text: name, within: 'nav a, aside a, a' }, waitFor ? { expect: waitFor } : {});
}

/**
 * Records a journal entry and posts it. lines: [{ account: 'code or search text', option: 'text of the option',
 * description?, debit?, credit? }]. Returns the posted entry as Mizan's API reads it.
 */
export async function recordJournal(s, api, { reference, memo, lines, explain }) {
  const before = new Set(((await api('GET', '/api/journal')).rows ?? []).map((e) => e.id));
  await s.say(explain ?? 'بسجّل قيد يومية جديد');
  await openScreen(s, 'قيود اليومية', { waitFor: `location.pathname === '/journal'` });
  await s.click({ text: 'قيد يومية جديد', exact: false, within: 'a,button' }, { expect: `document.querySelectorAll('table input[role=combobox]').length > 0` });
  await s.fill({ label: 'المرجع' }, reference);
  await s.fill({ label: 'البيان' }, memo);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (i >= 2) await s.click({ text: 'إضافة سطر', exact: false, within: 'button' });
    await s.say(l.say ?? `السطر ${i + 1}: ${l.option}`);
    await s.choose({ css: 'table tbody tr:nth-child(' + (i + 1) + ') input[role=combobox]' }, l.account, l.option);
    if (l.debit) await s.fill({ css: 'table tbody tr:nth-child(' + (i + 1) + ') input[aria-label="مدين"]' }, l.debit);
    if (l.credit) await s.fill({ css: 'table tbody tr:nth-child(' + (i + 1) + ') input[aria-label="دائن"]' }, l.credit);
  }
  // "غير متوازن" (not balanced) contains "متوازن" (balanced): wait for the warning to go AND the post button to be enabled
  await s.page.waitFor(`!document.body.innerText.includes('غير متوازن') && [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'حفظ وترحيل' && !b.disabled)`, { what: 'a balanced entry' });
  s.mark?.('balanced');
  await s.say('القيد متوازن: المدين = الدائن. بحفظه وبرحّله للدفاتر');
  await s.click({ text: 'حفظ وترحيل', within: 'button' }, { expect: `/^\\/journal\\/\\d+$/.test(location.pathname)`, timeout: 20_000 });
  const posted = await s.page.waitFor(`/^\\/journal\\/\\d+$/.test(location.pathname) && location.pathname`, { timeout: 20_000 });
  // proof: the entry exists in Mizan, is posted, and balances to the piastre
  const id = Number(posted.split('/').pop());
  const entry = await api('GET', `/api/journal/${id}`);
  const dr = entry.lines.reduce((a, l) => a + (l.debit ?? 0), 0), cr = entry.lines.reduce((a, l) => a + (l.credit ?? 0), 0);
  if (before.has(id) || entry.status !== 'posted' || dr !== cr || dr === 0) throw new Error(`the journal on screen is not a new posted balanced entry: ${JSON.stringify({ id, status: entry.status, dr, cr })}`);
  s.mark?.('proven', { what: 'journal', number: entry.number, debit: dr, credit: cr, status: entry.status });
  await s.say(`اتسجّل واترحّل: قيد رقم ${entry.number}، مدين ${(dr / 100).toLocaleString('ar-EG')} = دائن ${(cr / 100).toLocaleString('ar-EG')} جنيه`);
  return entry;
}

const until = async (read, ok, what, timeout = 15_000) => {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { last = await read(); if (ok(last)) return last; await new Promise((r) => setTimeout(r, 200)); }
  throw new Error(`Mizan does not show ${what}: ${JSON.stringify(last).slice(0, 300)}`);
};

/**
 * A sales invoice from the invoices screen: the customer, then one line per item (code, quantity; the price and VAT come
 * from the item), save and post. Proven by the posted document Mizan returns (number, total, VAT).
 */
export async function createSalesInvoice(s, api, { customer, customerOption, lines, explain, doneSay }) {
  await s.say(explain ?? 'بعمل فاتورة مبيعات');
  await openScreen(s, 'فواتير المبيعات', { waitFor: `location.pathname === '/sales/invoices'` });
  await s.click({ text: 'فاتورة جديدة', exact: false, within: 'a,button' }, { expect: `location.pathname === '/sales/invoices/new'` });
  await s.page.waitFor(`!!document.querySelector('table tbody input[role=combobox]')`);
  await s.choose({ label: 'العميل' }, customer, customerOption);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], row = `table tbody tr:nth-child(${i + 1})`;
    if (i > 0) await s.click({ text: 'إضافة سطر', exact: false, within: 'button' });
    if (l.say) await s.say(l.say);
    await s.choose({ css: `${row} input[role=combobox]` }, l.item, l.option ?? l.item);
    await s.fill({ css: `${row} input[aria-label="الكمية"]` }, l.qty);
  }
  await s.page.waitFor(`[...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'حفظ وترحيل' && !b.disabled)`, { what: 'an invoice ready to post' });
  s.mark?.('ready');
  await s.click({ text: 'حفظ وترحيل', within: 'button' }, { expect: `/^\\/sales\\/invoices\\/\\d+$/.test(location.pathname)`, timeout: 20_000 });
  const id = Number((await s.page.evaluate('location.pathname')).split('/').pop());
  const doc = await until(() => api('GET', `/api/documents/${id}`), (d) => d && d.status === 'posted', 'a posted invoice');
  s.mark?.('proven', { what: 'invoice', number: doc.number, total: doc.total, tax: doc.tax_total ?? null });
  if (doneSay) await s.say(doneSay(doc));
  return doc;
}

/** A receipt from a customer: the party, the amount, applied to the oldest open invoices first; save and post. */
export async function receivePayment(s, api, { party, partyOption, amount, explain, doneSay }) {
  await s.say(explain ?? 'بسجّل تحصيل من عميل');
  await s.page.evaluate(`history.pushState({}, '', '/receipts/new'); dispatchEvent(new PopStateEvent('popstate'))`);
  await s.page.waitFor(`location.pathname === '/receipts/new' && document.body.innerText.includes('مستلم من')`);
  await s.choose({ label: 'مستلم من' }, party, partyOption);
  await s.page.waitFor(`[...document.querySelectorAll('button')].some((b) => b.innerText.includes('الأقدم'))`, { what: 'the open invoices of the customer' });
  await s.fill({ label: 'المبلغ' }, amount);
  await s.click({ text: 'الأقدم', exact: false, within: 'button' });
  await s.page.waitFor(`[...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'حفظ وترحيل' && !b.disabled)`, { what: 'a receipt ready to post' });
  await s.wait(1500); // the allocation is on screen: let it be read, then back up to the post button
  await s.page.evaluate('window.scrollTo({ top: 0, behavior: "smooth" })');
  await s.wait(700);
  await s.click({ text: 'حفظ وترحيل', within: 'button' }, { expect: `/^\\/receipts\\/\\d+$/.test(location.pathname)`, timeout: 20_000 });
  const id = Number((await s.page.evaluate('location.pathname')).split('/').pop());
  const pay = await until(() => api('GET', `/api/payments/${id}`), (p) => p && p.status === 'posted', 'a posted receipt');
  s.mark?.('proven', { what: 'receipt', number: pay.number, amount: pay.amount, allocated: (pay.allocations ?? []).length });
  if (doneSay) await s.say(doneSay(pay));
  return pay;
}

/** Runs the month's depreciation from the depreciation screen (the month shown by default). Proven by the run Mizan lists. */
export async function runDepreciation(s, api, { month, explain, doneSay }) {
  await s.say(explain ?? 'بسجّل إهلاك الشهر');
  await openScreen(s, 'الإهلاك الشهري', { waitFor: `location.pathname === '/fixed-assets/depreciation'` });
  await s.page.waitFor(`[...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'تسجيل')`);
  await s.wait(1200);
  await s.click({ text: 'تسجيل', within: 'button' });
  // a confirmation may follow; the run shows up in the list of booked months
  if (await s.page.evaluate(`!![...document.querySelectorAll('[role=dialog] button')].find((b) => b.innerText.trim() === 'تسجيل' || b.innerText.trim() === 'تأكيد')`)) {
    await s.click({ text: 'تأكيد', within: '[role=dialog] button', exact: false }).catch(() => s.click({ text: 'تسجيل', within: '[role=dialog] button' }));
  }
  const runs = await until(() => api('GET', '/api/assets/depreciation/runs'), (r) => (r.rows ?? r).some((x) => x.month === month), `the depreciation of ${month}`);
  const run = (runs.rows ?? runs).find((x) => x.month === month);
  s.mark?.('proven', { what: 'depreciation', month, amount: run.amount ?? run.total ?? null });
  if (doneSay) await s.say(doneSay(run));
  return run;
}

/** Opens a report from the side menu and waits for it; `range` = text of the quick period to pick (e.g. 'هذا الربع'). */
export async function openReport(s, menuName, path, { explain, ready, range } = {}) {
  await s.say(explain);
  await openScreen(s, menuName, { waitFor: `location.pathname === ${JSON.stringify(path)}` });
  if (range) {
    await s.click({ css: 'select' });
    await s.page.evaluate(`(() => { const sel = document.querySelector('select'); const o = [...sel.options].find((x) => x.text.trim() === ${JSON.stringify(range)}); if (!o) return; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(sel, o.value); sel.dispatchEvent(new Event('change', { bubbles: true })); sel.blur(); })()`);
  }
  await s.page.waitFor(ready ?? `document.querySelectorAll('table tbody tr').length > 1`, { timeout: 20_000 });
}

/** Opens a Mizan screen by its address (the screens are single-page: this is what following a link does). */
export async function goTo(s, path, { explain, ready }) {
  if (explain) await s.say(explain);
  await s.page.evaluate(`history.pushState({}, '', ${JSON.stringify(path)}); dispatchEvent(new PopStateEvent('popstate'))`);
  await s.page.waitFor(ready ?? `location.pathname === ${JSON.stringify(path)}`, { timeout: 20_000 });
}

/**
 * Turns open requisitions into a purchase order from the requisitions screen: tick them, "convert", create the draft, then
 * "save and approve". Proven by the approved order Mizan returns (its lines, one per requisition, linked back to them).
 */
export async function convertToPurchaseOrder(s, api, { numbers, supplierNote, explain, doneSay }) {
  await s.say(explain);
  await goTo(s, '/purchasing/requisitions', { ready: `location.pathname === '/purchasing/requisitions' && document.querySelectorAll('input[type=checkbox]').length > 1` });
  const before = (await api('GET', '/api/purchase-orders')).length;
  for (const n of numbers) await s.click({ css: `input[aria-label="${n}"]` }, { expect: `document.querySelector('input[aria-label="${n}"]').checked` });
  await s.click({ text: 'تحويل إلى أمر شراء', exact: false, within: 'button' }, { expect: `!!document.querySelector('[role=dialog]')` });
  await s.wait(1400);   // the dialog shows the supplier Mizan proposes from the items
  await s.click({ text: 'إنشاء أمر', exact: false, within: '[role=dialog] button' }, { expect: `/^\\/purchasing\\/orders\\/\\d+\\/edit$/.test(location.pathname)`, timeout: 20_000 });
  await s.page.waitFor(`document.querySelectorAll('table tbody tr').length >= ${numbers.length}`, { timeout: 15_000 });
  await s.wait(1800);   // the draft with one line per requisition: let it be read
  if (supplierNote) await s.say(supplierNote);
  await s.click({ text: 'حفظ واعتماد', within: 'button' }, { expect: `/^\\/purchasing\\/orders\\/\\d+$/.test(location.pathname)`, timeout: 20_000 });
  const id = Number((await s.page.evaluate('location.pathname')).split('/').pop());
  const po = await until(() => api('GET', `/api/purchase-orders/${id}`), (p) => p && p.status === 'open' && p.lines.length === numbers.length, 'an approved purchase order');
  s.mark?.('proven', { what: 'purchase order', number: po.number, lines: po.lines.length, total: po.total ?? null });
  if (doneSay) await s.say(doneSay(po));
  return po;
}
