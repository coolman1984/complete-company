// Pairing (plan 50 WP-P1): connects the running applications to each other through their own admin APIs — machine keys
// made in each application (shown once, handed straight to the other side, never written here), peers configured in
// each direction, company ids compared. The admin passwords live only in this request. No dependencies.
import { randomUUID } from 'node:crypto';

export class HttpError extends Error {
  constructor(message, status, code) { super(message); this.name = 'HttpError'; this.status = status; this.code = code; }
}

/** What travels in each direction (plan 01 §1). */
export const FLOWS = {
  mizanToGmes: ['eco.item.v1', 'eco.warehouse.v1', 'eco.party.v1', 'acc.stock_position.v1', 'acc.sales_order.v1', 'acc.demand_plan.v1', 'acc.purchase_order.v1', 'acc.goods_receipt.v1'],
  // production facts are booked natively by Mizan (WP-M4): do not run link-mizan beside a paired Mizan, it would book them twice
  gmesToMizan: ['mes.purchase_requisition.v1', 'mes.supply_plan.v1', 'mes.lot_decision.v1', 'mes.shipment.dispatched.v1',
    'mes.material.consumed.v1', 'mes.production.completed.v1', 'mes.production.scrapped.v1', 'mes.work_order.closed.v1'],
  gmesToHr: ['mes.crew_requirement.v1', 'mes.labor_day.v1'],
  hrToMizan: ['hr.payroll_period.v1'],   // payroll totals per cost centre and account key (no names); HR calculates, Mizan books
};

/** A signed-in caller. `timeoutMs` is how long one call may take (a backup of a large database is checked by a rehearsal: minutes, not seconds). */
export function session(base, cookieName, timeoutMs = 20_000) {
  let cookie = '';
  const call = async (method, path, body) => {
    const r = await fetch(base + path, {
      method, signal: AbortSignal.timeout(timeoutMs),
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
      throw new HttpError(`${method} ${path}: ${r.status} ${typeof e === 'string' ? e : e?.code ?? ''} ${json?.message ?? e?.message ?? ''}`.trim(), r.status, typeof e === 'string' ? e : e?.code);
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
  const tag = randomUUID();
  const { urls, logins } = input;
  const mizan = session(urls.mizan, 'mizan_sid'), gmes = session(urls.gmes, 'gmes_sid'), hr = urls.hr ? session(urls.hr, 'hr_sid') : null;
  const previousKeys = [];
  const generatedName = /^(mizan|gmes|hr)-(?:\d{12}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/;
  try {
    await step('sign in to Mizan', () => mizan('POST', '/api/auth/login', { username: logins.mizan.user, password: logins.mizan.password }).then(() => 'ok'));
    await step('sign in to Itqan', () => gmes('POST', '/api/auth/login', { login: logins.gmes.user, password: logins.gmes.password }).then(() => 'ok'));
    if (hr) await step('sign in to HR', () => hr('POST', '/api/login', { username: logins.hr.user, password: logins.hr.password }).then(() => 'ok'));
    await step('read previous package keys', async () => {
      for (const [call, path, owners, revoke] of [
        [gmes, '/api/keys', hr ? ['mizan', 'hr'] : ['mizan'], k => `/api/keys/${encodeURIComponent(k.name)}/revoke`],
        [mizan, '/api/eco/keys', hr ? ['gmes', 'hr'] : ['gmes'], k => `/api/eco/keys/${k.id}/revoke`],
        ...(hr ? [[hr, '/api/admin/eco-keys', ['gmes'], k => `/api/admin/eco-keys/${k.id}/revoke`]] : []),
      ]) {
        const result = await call('GET', path);
        for (const k of Array.isArray(result) ? result : result.keys ?? []) if (k.active && generatedName.test(k.name) && owners.includes(k.name.split('-')[0])) previousKeys.push({ call, path: revoke(k) });
      }
      return `${previousKeys.length} prior package keys`;
    });

    const company = await step('company id (owner: Mizan)', async () => {
      const id = (await mizan('GET', '/api/eco/company')).companyId;
      if (typeof id !== 'string' || !id) throw new Error('Mizan did not report a company id');
      return id;
    });
    await step('Itqan uses the same company id', async () => {
      const h = await gmes('GET', '/api/health');
      if (String(h.company).toLowerCase() !== company.toLowerCase()) throw new Error(`Itqan runs with company ${h.company}; set GMES_COMPANY_ID=${company} in GMES\\data\\config.json and restart Itqan`);
      return 'same';
    });
    if (hr) await step('HR uses the same company id', async () => {
      const health = await hr('GET', '/api/admin/health');
      if (String(health.company?.id ?? '').toLowerCase() !== String(company).toLowerCase() || health.company?.provisional) throw new Error('HR must be installed with the company id owned by Mizan before pairing');
      return 'same';
    });

    // keys: each application makes the key the OTHER one will use to call it
    const gmesKeyForMizan = await step('Itqan key for Mizan', async () => (await gmes('POST', '/api/keys', { name: `mizan-${tag}`, scopes: ['eco.inbox.write', 'eco.feed.read', 'eco.acks.write'] })).key);
    const mizanKeyForGmes = await step('Mizan key for Itqan', async () => (await mizan('POST', '/api/eco/keys', { name: `gmes-${tag}`, scopes: ['eco.inbox.write', 'eco.acks.write'] })).key);
    await step('Mizan sends its master data and orders to Itqan', async () => {
      const old = (await mizan('GET', '/api/eco/peers')).find((p) => p.name === 'gmes');
      await mizan(old ? 'PUT' : 'POST', old ? `/api/eco/peers/${old.id}` : '/api/eco/peers', { name: 'gmes', url: urls.gmes, key: gmesKeyForMizan, consumer: 'mizan', push: true, pull: false, active: true, types: FLOWS.mizanToGmes });
      await mizan('POST', '/api/eco/resync');
      return FLOWS.mizanToGmes.length + ' types';
    });
    const addGmesPeer = async (name, url, key, types) => {
      const old = (await gmes('GET', '/api/eco/peers')).find((p) => p.name === name);
      return gmes(old ? 'PUT' : 'POST', old ? `/api/eco/peers/${old.id}` : '/api/eco/peers', { name, url, key, consumer: name, active: true, types });
    };
    await step('Itqan sends requisitions, supply plan, lot decisions, production and shipments to Mizan', async () => (await addGmesPeer('mizan', urls.mizan, mizanKeyForGmes, FLOWS.gmesToMizan), FLOWS.gmesToMizan.length + ' types'));

    if (hr) {
      const hrKeyForGmes = await step('HR key for Itqan', async () => (await hr('POST', '/api/admin/eco-keys', { name: `gmes-${tag}`, scopes: ['eco.inbox.write'] })).key);
      await step('Itqan sends crew requirements to HR', async () => (await addGmesPeer('hr', urls.hr, hrKeyForGmes, FLOWS.gmesToHr), 'crew requirements'));
      const gmesKeyForHr = await step('Itqan key for HR', async () => (await gmes('POST', '/api/keys', { name: `hr-${tag}`, scopes: ['eco.inbox.write'] })).key);
      await step('HR sends people, schedules and qualifications to Itqan', async () => {
        await hr('PUT', '/api/admin/integration', { gmes_url: urls.gmes, key: gmesKeyForHr });
        return 'configured';
      });
      // the payroll HR calculates is booked by Mizan: HR needs a key to call Mizan with (totals per cost centre only, no names)
      const mizanKeyForHr = await step('Mizan key for HR payroll', async () => (await mizan('POST', '/api/eco/keys', { name: `hr-${tag}`, scopes: ['eco.inbox.write'] })).key);
      await step('HR sends payroll totals to Mizan', async () => {
        await hr('PUT', '/api/payroll/target', { url: urls.mizan, key: mizanKeyForHr });
        return 'configured';
      });
    }

    // first exchange now, instead of waiting for the next cycle
    await step('first exchange', async () => {
      const m = await mizan('POST', '/api/eco/sync');
      const g = await gmes('POST', '/api/eco/push');
      const errors = [...(m.peers ?? []), ...(g.peers ?? [])].filter((p) => p.error).map((p) => `${p.peer}: ${p.error}`);
      if (hr) {
        const sent = await hr('POST', '/api/admin/integration/run');
        if (sent.key_missing || sent.error || sent.stopped_by || sent.problem_count || sent.rejected || sent.outbox?.rejected || sent.outbox?.pending) errors.push(`HR exchange failed: ${sent.error ?? sent.stopped_by ?? (sent.key_missing ? 'key missing' : `${sent.problem_count ?? 0} validation problems, ${sent.outbox?.rejected ?? sent.rejected ?? 0} rejected and ${sent.outbox?.pending ?? 0} pending`)}`);
        const status = await hr('GET', '/api/admin/eco-keys');
        if ((status.inbox?.unresolved_rejections ?? status.inbox?.rejected) !== 0) errors.push('HR has unresolved refused incoming events');
      }
      for (const [name, call] of [['Mizan', mizan], ['Itqan', gmes]]) {
        const parked = await call('GET', '/api/integration/events?status=parked');
        if (parked.length) errors.push(`${name}: ${parked.length} refused event(s); resolve the reported cause and retry the parked events`);
      }
      if (errors.length) throw new Error(errors.join('; '));
      return { mizan: m.peers, gmes: g.peers };
    });
    await step('retire previous package keys', async () => {
      for (const k of previousKeys) await k.call('POST', k.path);
      return `${previousKeys.length} retired after successful exchange`;
    });
    return { ok: true, company, steps };
  } catch {
    return { ok: false, steps };
  }
}
