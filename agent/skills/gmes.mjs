// GMES skills: what the agent does on the shop floor through GMES's own screens (the operator station EXE2020, the
// reports), each step on the stage, each result read back through GMES's API before the skill reports success.
// Screen words are GMES's Arabic interface.

/** Signs in; switches the sign-in page to Arabic first, the way a person would. */
export async function signIn(s, { user, password }) {
  await s.page.waitFor(`!!document.querySelector('input[type=password]')`);
  if (await s.page.evaluate(`[...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'العربية')`)) {
    await s.say('بفتح برنامج التصنيع وبحوّله للعربي');
    await s.click({ text: 'العربية', within: 'button' }, { expect: `document.documentElement.dir === 'rtl' || !![...document.querySelectorAll('main[dir=rtl]')].length` });
  }
  await s.say('بسجّل دخول باسم المستخدم بتاعي');
  await s.fill({ css: 'input:not([type=password]):not([type=checkbox])' }, user);
  await s.fill({ css: 'input[type=password]' }, password, { cps: 30 });
  await s.key('Enter');
  await s.page.waitFor(`!document.querySelector('input[type=password]') && location.hash.length > 1`);
}

/** The operator station on a line and station, with the running work order selected. */
export async function atStation(s, api, { line, station: st, explain }) {
  await s.say(explain ?? `بروح محطة العامل على خط ${line}`);
  if (!(await s.page.evaluate(`location.hash === '#EXE2020'`))) await s.click({ text: 'محطة العامل', within: '.eco-nav-label' }, { expect: `location.hash === '#EXE2020'` });
  await s.page.waitFor(`!!document.querySelector('.st-buttons') && document.querySelectorAll('.st-where select')[1]?.options.length > 1 && !!document.querySelector('.st-wo-nums')`, { timeout: 20_000 });
  if (st) {
    // a native list: the agent points at it and picks the station (the list itself is drawn by the system, not the page)
    await s.click({ css: '.st-where select:nth-of-type(2)' });
    await s.page.evaluate(`(() => { const sel = document.querySelectorAll('.st-where select')[1]; sel.value = ${JSON.stringify(st)}; sel.dispatchEvent(new Event('change', { bubbles: true })); sel.blur(); })()`);
    await s.page.waitFor(`document.querySelectorAll('.st-where select')[1].value === ${JSON.stringify(st)} && !!document.querySelector('.st-wo-nums')`);
  }
}

const DIALOG = '.eco-dialog';
const dialogWith = (text) => `[...document.querySelectorAll('${DIALOG}')].some((d) => d.innerText.includes(${JSON.stringify(text)}))`;
async function woNow(api, woId) { return api('GET', `/api/work-orders/${woId}`); }

/** Books good output of one lot (for tiles: the shade and caliber) with the "Good ×N" button. Proven on the order. */
export async function goodQty(s, api, { woId, qty, lot, explain }) {
  const before = Number((await woNow(api, woId)).completed_qty);
  await s.say(explain ?? `بسجّل الإنتاج السليم: ${qty} في لوط ${lot}`);
  await s.click({ css: '.st-big-rework' }, { expect: dialogWith('كم قطعة جيدة') });
  await s.fill({ css: `${DIALOG} input` }, qty);
  await s.key('Enter');
  await s.page.waitFor(dialogWith('اللوط') + ` && !${dialogWith('كم قطعة جيدة')}`, { timeout: 10_000 });
  await s.fill({ css: `${DIALOG} input` }, lot);
  await s.key('Enter');
  const got = await untilApi(() => woNow(api, woId), (w) => Number(w.completed_qty) === before + Number(qty));
  s.mark?.('proven', { what: 'good', qty, lot, completed: got.completed_qty });
  return got;
}

/** Books scrap of one reason with the scrap dialog's quantity. Proven on the order. */
export async function scrapQty(s, api, { woId, qty, reasonText, explain }) {
  const before = Number((await woNow(api, woId)).scrapped_qty);
  await s.say(explain ?? `بسجّل فاقد ${qty}: ${reasonText}`);
  await s.click({ css: '.st-big-scrap' }, { expect: `!!document.querySelector('.st-reasons')` });
  await s.fill({ css: `${DIALOG} input` }, qty);
  await s.click({ text: reasonText, within: '.st-reason span' }, { expect: `!document.querySelector('.st-reasons')` });
  const got = await untilApi(() => woNow(api, woId), (w) => Number(w.scrapped_qty) === before + Number(qty));
  s.mark?.('proven', { what: 'scrap', qty, reason: reasonText, scrapped: got.scrapped_qty });
  return got;
}

/** Stops the line (or the chosen station) for a reason, then resumes after `seconds`. Proven in the downtime log. */
export async function stopAndResume(s, api, { reasonText, seconds = 3, line, explain, resumeExplain }) {
  await s.say(explain ?? `الخط وقف: ${reasonText}`);
  await s.click({ css: '.st-big-stop' }, { expect: `!!document.querySelector('.st-reasons')` });
  await s.click({ text: reasonText, within: '.st-reason span' }, { expect: `!document.querySelector('.st-stopbar').hidden` });
  const open = await untilApi(() => api('GET', `/api/stoppages?open=1&line=${line}`), (l) => l.length > 0);
  s.mark?.('stopped', { id: open[0].id });
  await s.wait(seconds * 1000);
  await s.say(resumeExplain ?? 'الفرن رجع لحرارته: بشغّل الخط تاني');
  await s.click({ css: '.st-resume' }, { expect: `document.querySelector('.st-stopbar').hidden` });
  await untilApi(() => api('GET', `/api/stoppages?open=1&line=${line}`), (l) => l.length === 0);
  s.mark?.('proven', { what: 'resumed' });
}

/** Opens a report screen and waits for its figures. */
export async function openReport(s, code, { explain, ready }) {
  await s.say(explain);
  await s.page.evaluate(`location.hash = '#${code}'`);
  await s.page.waitFor(ready ?? `location.hash === '#${code}' && document.querySelectorAll('[role=row], tr').length > 1`, { timeout: 20_000 });
}

async function untilApi(read, ok, timeout = 15_000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { last = await read(); if (ok(last)) return last; await new Promise((r) => setTimeout(r, 150)); }
  throw new Error('the application does not show the booking: ' + JSON.stringify(last).slice(0, 300));
}


/**
 * Releases the day's plan onto a line from the release plan (EXE2010): the "+" of the line and shift, the product, the
 * quantity, create. Proven by the order the server now holds for that day and line.
 */
export async function releaseFromPlan(s, api, { itemCode, qty, line, explain, doneExplain }) {
  await s.say(explain ?? 'بحوّل خطة النهارده لأمر شغل على الخط');
  if (!(await s.page.evaluate(`location.hash === '#EXE2010'`))) await s.page.evaluate(`location.hash = '#EXE2010'`);
  await s.page.waitFor(`!!document.querySelector('.mes-plan-row .mes-plan-cell button')`, { timeout: 20_000 });
  const before = (await api('GET', '/api/work-orders')).length;
  await s.click({ css: '.mes-plan-row .mes-plan-cell button' }, { expect: `!!document.querySelector('.eco-dialog select')` });
  // the product is a native list: the agent points at it and picks the product (the open list is drawn by the system)
  await s.click({ css: '.eco-dialog select' });
  await s.page.evaluate(`(() => { const sel = document.querySelector('.eco-dialog select'); const o = [...sel.options].find((x) => x.text.startsWith(${JSON.stringify(itemCode)})); sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); sel.blur(); })()`);
  await s.fill({ css: '.eco-dialog input[type=number]' }, qty);
  await s.click({ text: 'إنشاء', within: '.eco-dialog button' }, { expect: `!document.querySelector('.eco-dialog')`, timeout: 15_000 });
  const got = await untilApi(() => api('GET', '/api/work-orders'), (l) => l.length === before + 1);
  const wo = got.find((w) => w.line_code === line) ?? got[got.length - 1];
  await s.page.waitFor(`document.querySelectorAll('.mes-plan-wo').length > 0`, { timeout: 10_000 });
  s.mark?.('proven', { what: 'released', wo: wo.code });
  if (doneExplain) await s.say(doneExplain);
  return wo;
}

/** Opens the line board (DSH5010) on a line and looks at it whole. Returns refresh(): the board reads the server again. */
export async function watchBoard(s, { line, explain }) {
  await s.say(explain ?? `بفتح لوحة خط ${line}`);
  await s.page.evaluate(`location.hash = '#DSH5010'`);
  await s.page.waitFor(`!!document.querySelector('.bd-pick') && document.querySelector('.bd-pick').options.length > 0`, { timeout: 20_000 });
  const pick = `(() => { const sel = document.querySelector('.bd-pick'); sel.value = ${JSON.stringify(line)}; sel.dispatchEvent(new Event('change', { bubbles: true })); })()`;
  await s.page.evaluate(pick);
  await s.page.waitFor(`!!document.querySelector('.bd-kpis .bd-kpi')`, { timeout: 15_000 });
  await s.page.evaluate('window.__agent && (__agent.ring(null))');
  // the board refreshes itself every 30 s; between two bookings filmed seconds apart it is asked at once, the same request
  return async () => { await s.page.evaluate(pick); await s.wait(350); };
}

/** Opens an Itqan screen by its code and waits for the control or the words that show it is ready. */
export async function goTo(s, code, { explain, ready }) {
  if (explain) await s.say(explain);
  await s.page.evaluate(`location.hash = '#${code}'`);
  await s.page.waitFor(ready ?? `location.hash === '#${code}' && !!document.querySelector('.eco-screen, .mes-screen, table, [role=grid], .eco-grid')`, { timeout: 20_000 });
}

/** Runs the material planning from PLN2010 with its button. Proven by the new run Itqan lists (orders, requisitions, errors). */
export async function runPlanning(s, api, { explain, doneSay }) {
  await goTo(s, 'PLN2010', { explain, ready: `location.hash === '#PLN2010' && [...document.querySelectorAll('button')].some((b) => b.innerText.includes('شغّل التخطيط الآن'))` });
  await s.wait(1500);
  const before = (await api('GET', '/api/pln/runs')).length;
  await s.click({ text: 'شغّل التخطيط الآن', exact: false, within: 'button' });
  const runs = await untilApi(() => api('GET', '/api/pln/runs'), (l) => l.length === before + 1);
  const run = runs[0];
  await s.page.waitFor(`document.body.innerText.includes(${JSON.stringify(run.code)})`, { timeout: 15_000 });
  s.mark?.('proven', { what: 'mrp', run: run.code, orders: run.stats.plannedOrders, requisitions: run.stats.requisitions, errors: run.stats.errors });
  if (doneSay) await s.say(doneSay(run));
  return run;
}
