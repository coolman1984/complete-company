// Space Planner skills: the agent plans a shipment in Space Planner's own screens (the shipment dialog, then the
// containers side by side with the stuffing playback), each result read back through Space Planner's API.
// Space Planner's interface is English (its own rule); the agent's captions stay Arabic.

/**
 * Plans a shipment from the projects page: one part with its size, quantity and weight, then opens the containers.
 * Returns { shipment, containers: pieces per container } as Space Planner stored them.
 */
export async function planShipment(s, api, { name, part, containerLabel = '40′ high cube', explain, answerSay }) {
  await s.say(explain ?? 'بفتح مخطط المساحات عشان أحسب الحاويات');
  await s.page.waitFor(`!!document.querySelector('[data-testid=plan-shipment]')`, { timeout: 20_000 });
  await s.click({ css: '[data-testid=plan-shipment]' }, { expect: `!!document.querySelector('.shipment-dialog')` });
  await s.fill({ css: 'input[name=shipment-name]' }, name);
  // the container type is a native list: point at it, then choose
  await s.click({ css: 'select[name=shipment-container]' });
  await s.page.evaluate(`(() => { const sel = document.querySelector('select[name=shipment-container]'); const o = [...sel.options].find((x) => x.text.startsWith(${JSON.stringify(containerLabel)})); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(sel, o.value); sel.dispatchEvent(new Event('change', { bubbles: true })); sel.blur(); })()`);
  await s.fill({ css: 'input[aria-label="Part 1 name"]' }, part.name);
  await s.fill({ css: 'input[aria-label="Part 1 length"]' }, part.length);
  await s.fill({ css: 'input[aria-label="Part 1 width"]' }, part.width);
  await s.fill({ css: 'input[aria-label="Part 1 height"]' }, part.height);
  await s.fill({ css: 'input[aria-label="Part 1 quantity"]' }, part.quantity);
  if (part.kg) await s.fill({ css: 'input[aria-label="Part 1 kg each"]' }, part.kg);
  if (!part.mayTilt && (await s.page.evaluate(`document.querySelector('input[aria-label="Part 1 may lie on its side"]').checked`))) {
    await s.click({ css: 'input[aria-label="Part 1 may lie on its side"]' }, { expect: `!document.querySelector('input[aria-label="Part 1 may lie on its side"]').checked` });
  }
  await s.page.waitFor(`!!document.querySelector('.shipment-answer-count .big')`, { timeout: 10_000 });
  const count = Number(await s.page.evaluate(`document.querySelector('.shipment-answer-count .big').innerText`));
  s.mark?.('answer', { containers: count });
  if (answerSay) await s.say(answerSay(count));
  await s.click({ css: '[data-testid=create-shipment]' }, { expect: `/^#\\/s\\//.test(location.hash)`, timeout: 30_000 });
  const shipment = await s.page.evaluate(`location.hash.slice(4)`);
  await s.page.waitFor(`!!document.querySelector('[data-testid=shipment-title]') && !!document.querySelector('canvas')`, { timeout: 30_000 });
  // proof: what Space Planner stored for this shipment, container by container (pieces and their weight)
  const list = await api('GET', '/api/projects');
  const rows = (list.projects ?? list).filter((p) => (p.name ?? '').startsWith(name + ' · container')).sort((a, b) => (a.name < b.name ? -1 : 1));
  const containers = [];
  for (const row of rows) {
    const p = await api('GET', `/api/projects/${row.id}`);
    const project = p.project ?? p;
    const items = Object.values(project.items);
    containers.push({ pieces: items.length, kg: Math.round(items.reduce((m, i) => m + (project.catalog[i.definitionId]?.mass ?? 0), 0) / 1000) });
  }
  if (containers.length !== count) throw new Error(`the dialog said ${count} containers, Space Planner stored ${containers.length}`);
  s.mark?.('proven', { what: 'shipment', shipment, containers });
  return { shipment, count, containers };
}

/** Plays the stuffing on the shipment page and waits for it to finish. */
export async function playStuffing(s, { explain, seconds = 12 } = {}) {
  await s.page.evaluate('window.scrollTo(0, 0)');
  await s.say(explain ?? 'بشغّل التحميل: الحاوية بتتملي حيطة بحيطة من الجدار الأمامي للباب');
  await s.click({ css: '[data-testid=play-shipment]' });
  // then look at the containers themselves, not at the button
  const box = await s.page.evaluate(`(() => { const c = document.querySelector('.shipment-stage') || document.querySelector('canvas'); c.scrollIntoView({ block: 'center' }); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; })()`);
  await s.page.evaluate('window.__agent && __agent.ring(null)');
  s.mark?.('focus', { box });
  await s.wait(seconds * 1000);
}
