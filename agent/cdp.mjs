// A small Chrome DevTools Protocol client with no dependency (Node 22's built-in WebSocket). It launches Chrome or Edge
// on its own profile folder (never the user's real profile), finds the port Chrome chose (DevToolsActivePort, polled,
// never a fixed sleep), talks to 127.0.0.1 only (on Windows "localhost" costs 2 s per call: IPv6 first), and gives each
// window a Page with send/evaluate/waitFor/screenshot and real mouse and keyboard input.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Polls fn until it returns a truthy value or the cap passes; the cap is generous because the loop exits at once. */
export async function until(fn, { timeout = 30_000, every = 100, what = 'condition' } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e; }
    await sleep(every);
  }
  throw new Error(`timed out waiting for ${what}${last instanceof Error ? ': ' + last.message : ''}`);
}

/** Chrome or Edge on this machine (Windows paths first), or CHROME_PATH. */
export function findBrowser() {
  const c = [process.env.CHROME_PATH,
    join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
    join(process.env.LOCALAPPDATA ?? '', 'Google\\Chrome\\Application\\chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
    join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe'),
    '/opt/pw-browsers/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'];
  return c.find((p) => p && existsSync(p));
}

class Connection {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0; this.pending = new Map(); this.listeners = new Set();
    this.ready = new Promise((ok, fail) => { this.ws.onopen = ok; this.ws.onerror = () => fail(new Error('cannot connect to ' + url)); });
    this.ws.onmessage = (m) => {
      const msg = JSON.parse(typeof m.data === 'string' ? m.data : Buffer.from(m.data).toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { ok, fail, method } = this.pending.get(msg.id); this.pending.delete(msg.id);
        msg.error ? fail(new Error(`${method}: ${msg.error.message}`)) : ok(msg.result);
      } else for (const l of this.listeners) l(msg);
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((ok, fail) => { this.pending.set(id, { ok, fail, method }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  close() { try { this.ws.close(); } catch { /* already closed */ } }
}

/** One browser window (a page target). */
export class Page {
  constructor(conn, targetId) { this.conn = conn; this.targetId = targetId; }
  send(m, p) { return this.conn.send(m, p); }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page script: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
    return r.result.value;
  }
  /** Calls a function defined in the page with JSON arguments. */
  call(fnSource, ...args) { return this.evaluate(`(${fnSource})(...${JSON.stringify(args)})`); }
  waitFor(expression, opts = {}) { return until(() => this.evaluate(expression), { what: expression.slice(0, 80), ...opts }); }
  async goto(url) { await this.send('Page.navigate', { url }); await this.waitFor('document.readyState === "complete"'); }
  async screenshot(file) { const r = await this.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(r.data, 'base64')); return file; }
  async mouse(type, x, y, extra = {}) { await this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra }); }
  async click(x, y) { await this.mouse('mouseMoved', x, y, { button: 'none' }); await this.mouse('mousePressed', x, y); await this.mouse('mouseReleased', x, y); }
  async key(key, code = key, keyCode) {
    const vk = keyCode ?? { Enter: 13, Tab: 9, Escape: 27, Backspace: 8, ArrowDown: 40, ArrowUp: 38 }[key];
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, ...(key === 'Enter' ? { text: '\r' } : {}) });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  }
  /** Types like a person: one character at a time, as real input events the page's framework sees. */
  async type(text, cps = 14) { for (const ch of String(text)) { await this.send('Input.insertText', { text: ch }); if (cps) await sleep(1000 / cps); } }
  close() { this.conn.close(); }
}

/** Launches the browser on its own profile folder and returns { port, open(url, bounds), close() }. */
export async function launch({ profileDir, headless = false, exe = findBrowser(), width = 1600, height = 900 } = {}) {
  if (!exe) throw new Error('Chrome or Edge was not found; set CHROME_PATH');
  mkdirSync(profileDir, { recursive: true });
  const portFile = join(profileDir, 'DevToolsActivePort');
  try { writeFileSync(portFile, ''); } catch { /* stale file from a previous run: overwritten below */ }
  const args = [`--user-data-dir=${profileDir}`, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--no-first-run',
    '--no-default-browser-check', '--disable-popup-blocking', '--disable-features=Translate,OptimizationHints,MediaRouter',
    // nothing leaves the machine: a demo must run the same with the network unplugged
    '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-default-apps', '--no-pings', '--metrics-recording-only',
    '--disable-client-side-phishing-detection', '--disable-domain-reliability', '--disable-field-trial-config', '--safebrowsing-disable-auto-update', `--window-size=${width},${height}`, 'about:blank'];
  if (headless) args.unshift('--headless=new', '--hide-scrollbars');
  if (process.platform === 'linux' && process.getuid?.() === 0) args.unshift('--no-sandbox'); // containers run as root
  const proc = spawn(exe, args, { stdio: 'ignore', detached: false });
  let exited = null; proc.on('exit', (code) => { exited = code ?? 'signal'; });
  const port = await until(() => { if (exited !== null) throw new Error(`the browser stopped at start (exit ${exited})`); const t = readFileSync(portFile, 'utf8').split('\n')[0].trim(); return /^\d+$/.test(t) ? Number(t) : null; }, { what: 'the browser debugging port', timeout: 30_000 });
  const base = `http://127.0.0.1:${port}`;
  const ipv4 = (u) => u.replace('ws://localhost', 'ws://127.0.0.1');
  const version = await until(() => fetch(base + '/json/version').then((r) => r.json()), { what: 'the browser endpoint' });
  const browser = new Connection(ipv4(version.webSocketDebuggerUrl)); await browser.ready;
  const pages = [];
  return {
    port, proc,
    /** Opens a new window on url (bounds: {left, top, width, height}) and returns its Page. */
    async open(url, bounds) {
      const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', newWindow: true });
      const list = await until(async () => (await (await fetch(base + '/json/list')).json()).find((t) => t.id === targetId), { what: 'the new window' });
      const conn = new Connection(ipv4(list.webSocketDebuggerUrl)); await conn.ready;
      const page = new Page(conn, targetId);
      await page.send('Page.enable'); await page.send('Runtime.enable');
      if (bounds && !headless) {
        const { windowId } = await browser.send('Browser.getWindowForTarget', { targetId });
        await browser.send('Browser.setWindowBounds', { windowId, bounds: { ...bounds, windowState: 'normal' } });
      }
      if (headless && bounds) await page.send('Emulation.setDeviceMetricsOverride', { width: bounds.width, height: bounds.height, deviceScaleFactor: bounds.scale ?? 1, mobile: false });
      // the plant's clock on every screen, whatever the machine's zone (a film shot on a server in UTC showed two times)
      if (bounds?.timezone) await page.send('Emulation.setTimezoneOverride', { timezoneId: bounds.timezone }).catch(() => {});
      pages.push(page);
      if (url) await page.goto(url);
      return page;
    },
    /** Brings a window to the front (the stage shows the application the agent is working in). */
    async front(page) { await browser.send('Target.activateTarget', { targetId: page.targetId }); },
    async close() { for (const p of pages) p.close(); try { await browser.send('Browser.close'); } catch { /* gone */ } browser.close(); try { proc.kill(); } catch { /* gone */ } },
  };
}
