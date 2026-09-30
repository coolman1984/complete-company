// Pairing (plan 50 WP-P1): connects the running applications to each other through their own admin APIs — machine keys
// made in each application (shown once, handed straight to the other side, never written here), peers configured in
// each direction, company ids compared. The admin passwords live only in this request. No dependencies.

/** What travels in each direction (plan 01 §1). */
export const FLOWS = {
  mizanToGmes: ['eco.item.v1', 'eco.warehouse.v1', 'eco.party.v1', 'acc.stock_position.v1', 'acc.sales_order.v1', 'acc.demand_plan.v1', 'acc.purchase_order.v1', 'acc.goods_receipt.v1'],
  // production facts are booked natively by Mizan (WP-M4): do not run link-mizan beside a paired Mizan, it would book them twice
  gmesToMizan: ['mes.purchase_requisition.v1', 'mes.supply_plan.v1', 'mes.lot_decision.v1', 'mes.shipment.dispatched.v1',
    'mes.material.consumed.v1', 'mes.production.completed.v1', 'mes.production.scrapped.v1', 'mes.work_order.closed.v1'],
  gmesToHr: ['mes.crew_requirement.v1'],
};

export function session(base, cookieName) {
  let cookie = '';
  const call = async (method, path, body) => {
    const r = await fetch(base + path, {
      method, signal: AbortSignal.timeout(20_000),
      headers: { 'content-type': 'application/json', origin: base, ...(cookie ? { cookie } : {}) },
      body: body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(body),
    });
    const set = r.headers.get('set-cookie');
    if (set && set.startsWith(cookieName + '=')) cookie = set.split(';')[0];
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 200) }; }
    if (!r.ok) {
      const e = json?.error;
      throw new Error(`${method} ${path}: ${r.status} ${typeof e === 'string' ? e : e?.code ?? ''} ${json?.message ?? e?.message ?? ''}`.trim());
    }
    return json;
  };
  return call;
}

/**
 * input: { urls: {mizan, gmes, hr}, logins: {mizan:{user,password}, gmes:{...}, hr:{...}} }.
 * Returns { ok, steps: [{step, ok, detail}] }. Stops at the first failure, saying which step.
 */
export async function pair(input) {
  const steps = [];
  const step = async (name, fn) => {
    try { const detail = await fn(); steps.push({ step: name, ok: true, detail }); return detail; }
    catch (e) { steps.push({ step: name, ok: false, detail: e.message }); throw e; }
  };
  const tag = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
  const { urls, logins } = input;
  const mizan = session(urls.mizan, 'mizan_sid'), gmes = session(urls.gmes, 'gmes_sid'), hr = urls.hr ? session(urls.hr, 'hr_sid') : null;
  try {
    await step('sign in to Mizan', () => mizan('POST', '/api/auth/login', { username: logins.mizan.user, password: logins.mizan.password }).then(() => 'ok'));
    await step('sign in to GMES', () => gmes('POST', '/api/auth/login', { login: logins.gmes.user, password: logins.gmes.password }).then(() => 'ok'));
    if (hr) await step('sign in to HR', () => hr('POST', '/api/login', { username: logins.hr.user, password: logins.hr.password }).then(() => 'ok'));

    const company = await step('company id (owner: Mizan)', async () => (await mizan('GET', '/api/eco/company')).companyId);
    await step('GMES uses the same company id', async () => {
      const h = await (await fetch(urls.gmes + '/api/health')).json();
      if (h.company !== company) throw new Error(`GMES runs with company ${h.company}; set GMES_COMPANY_ID=${company} in GMES\\data\\config.json and restart GMES`);
      return 'same';
    });

    // keys: each application makes the key the OTHER one will use to call it
    const gmesKeyForMizan = await step('GMES key for Mizan', async () => (await gmes('POST', '/api/keys', { name: `mizan-${tag}`, scopes: ['eco.inbox.write', 'eco.feed.read', 'eco.acks.write'] })).key);
    const mizanKeyForGmes = await step('Mizan key for GMES', async () => (await mizan('POST', '/api/eco/keys', { name: `gmes-${tag}`, scopes: ['eco.inbox.write', 'eco.acks.write'] })).key);
    await step('Mizan sends its master data and orders to GMES', async () => {
      const old = (await mizan('GET', '/api/eco/peers')).find((p) => p.name === 'gmes');
      if (old) await mizan('DELETE', `/api/eco/peers/${old.id}`);
      await mizan('POST', '/api/eco/peers', { name: 'gmes', url: urls.gmes, key: gmesKeyForMizan, consumer: 'mizan', push: true, pull: false, types: FLOWS.mizanToGmes });
      await mizan('POST', '/api/eco/resync');
      return FLOWS.mizanToGmes.length + ' types';
    });
    const addGmesPeer = async (name, url, key, types) => {
      const old = (await gmes('GET', '/api/eco/peers')).find((p) => p.name === name);
      if (old) await gmes('DELETE', `/api/eco/peers/${old.id}`);
      return gmes('POST', '/api/eco/peers', { name, url, key, consumer: name, types });
    };
    await step('GMES sends requisitions, supply plan, lot decisions, production and shipments to Mizan', async () => (await addGmesPeer('mizan', urls.mizan, mizanKeyForGmes, FLOWS.gmesToMizan), FLOWS.gmesToMizan.length + ' types'));

    if (hr) {
      const hrKeyForGmes = await step('HR key for GMES', async () => (await hr('POST', '/api/admin/eco-keys', { name: `gmes-${tag}`, scopes: ['eco.inbox.write'] })).key);
      await step('GMES sends crew requirements to HR', async () => (await addGmesPeer('hr', urls.hr, hrKeyForGmes, FLOWS.gmesToHr), 'crew requirements'));
      const gmesKeyForHr = await step('GMES key for HR', async () => (await gmes('POST', '/api/keys', { name: `hr-${tag}`, scopes: ['eco.inbox.write'] })).key);
      await step('HR sends people, schedules and qualifications to GMES', async () => {
        await hr('PUT', '/api/admin/integration', { gmes_url: urls.gmes, key: gmesKeyForHr });
        return 'configured';
      });
    }

    // first exchange now, instead of waiting for the next cycle
    await step('first exchange', async () => {
      const m = await mizan('POST', '/api/eco/sync');
      const g = await gmes('POST', '/api/eco/push');
      const errors = [...(m.peers ?? []), ...(g.peers ?? [])].filter((p) => p.error).map((p) => `${p.peer}: ${p.error}`);
      if (errors.length) throw new Error(errors.join('; '));
      return { mizan: m.peers, gmes: g.peers };
    });
    return { ok: true, company, steps };
  } catch {
    return { ok: false, steps };
  }
}
