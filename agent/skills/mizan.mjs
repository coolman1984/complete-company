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
