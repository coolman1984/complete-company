// Operations across the applications (plan 50 WP-X3): "Back up everything" asks each application to make its own backup through its
// own admin API and reports what each one says about it. A backup only counts when the application REHEARSED it (opened the copy
// elsewhere and checked it): an answer without a passing rehearsal is reported as a failure. The passwords live only in this
// request; nothing is stored here and no file of any application is read. No dependencies.
import { session } from './pair.mjs';

/** How each application is asked (its sign-in, and the route that makes and rehearses a backup). */
export const APPS = [
  { key: 'mizan', name: 'Mizan', cookie: 'mizan_sid', login: (l) => ['POST', '/api/auth/login', { username: l.user, password: l.password }], backup: '/api/system/backups' },
  { key: 'gmes', name: 'GMES', cookie: 'gmes_sid', login: (l) => ['POST', '/api/auth/login', { login: l.user, password: l.password }], backup: '/api/system/backups' },
  { key: 'hr', name: 'HR-System', cookie: 'hr_sid', login: (l) => ['POST', '/api/login', { username: l.user, password: l.password }], backup: '/api/admin/backups' },
];

/**
 * input: { urls: {mizan, gmes, hr}, logins: {mizan:{user,password}, ...} }. An application with no address or no login is left out.
 * Returns { ok, results: [{ key, name, ok, backup, detail }] }; ok only when every application asked made a backup that passed its rehearsal.
 */
export async function backupAll({ urls, logins }) {
  const results = [];
  for (const app of APPS) {
    const url = urls?.[app.key], login = logins?.[app.key];
    if (!url || !login?.user) continue;
    try {
      const call = session(url, app.cookie);
      const [method, path, body] = app.login(login);
      await call(method, path, body);
      const made = await call('POST', app.backup);
      const passed = made?.rehearsal?.ok === true;
      results.push({
        key: app.key, name: app.name, ok: passed, backup: made?.name ?? null,
        detail: passed ? 'made and rehearsed' : `made but the rehearsal did not pass: ${JSON.stringify(made?.rehearsal?.problems ?? made?.rehearsal ?? 'no rehearsal reported').slice(0, 300)}`,
      });
    } catch (e) {
      results.push({ key: app.key, name: app.name, ok: false, backup: null, detail: e.message });
    }
  }
  return { ok: results.length > 0 && results.every((r) => r.ok), results };
}
