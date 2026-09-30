// HTTP clients of the running applications (no database is ever touched). A signed-in session that the simulated clock has outlived is
// renewed once and the call repeated. Each client counts its calls, so a run can say how much work it did.

export function client(base, cookieName, signIn) {
  let cookie = '';
  const stats = { calls: 0, relogins: 0 };
  const send = async (method, path, body, opts) => {
    stats.calls++;
    const r = await fetch(base + path, {
      method, signal: AbortSignal.timeout(120_000),
      headers: { 'content-type': 'application/json', origin: base, ...(cookie ? { cookie } : {}), ...(opts.key ? { 'x-eco-key': opts.key } : {}) },
      body: body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(body),
    });
    const set = r.headers.get('set-cookie');
    if (set && set.startsWith(cookieName + '=')) cookie = set.split(';')[0];
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 200) }; }
    return { status: r.status, ok: r.ok, json };
  };
  const call = async (method, path, body, opts = {}) => {
    let r = await send(method, path, body, opts);
    if (r.status === 401 && signIn && !opts.noRelogin) {
      stats.relogins++;
      const [m, p, b] = signIn();
      await send(m, p, b, { noRelogin: true });
      r = await send(method, path, body, opts);
    }
    if (!r.ok && !opts.allow) {
      const e = r.json?.error;
      const why = r.json?.issues ?? e?.issues ?? e?.details ?? r.json?.details;
      throw new Error(`${method} ${path}: ${r.status} ${typeof e === 'string' ? e : (e?.code ?? '')} ${r.json?.message ?? e?.message ?? ''} ${why ? JSON.stringify(why).slice(0, 400) : ''}`.trim());
    }
    return opts.status ? { status: r.status, body: r.json } : r.json;
  };
  call.stats = stats;
  call.base = base;
  return call;
}
