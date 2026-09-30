// The stage: what the audience sees while the agent works in an application's real screens. A layer drawn over the page
// (it never catches a click: pointer-events none) shows the agent's cursor gliding to each control, a ring around the
// control it works on, a ripple where it clicks, and a caption saying what it is doing and why. The input itself is
// real: Chrome's own mouse and keyboard events (CDP Input.*), so the application cannot tell the agent from a person,
// and every record lands through the application's own screens and rules.
//
// Finding a control follows the rules learned driving G-MES at night (opening-nerp-tcode CLAUDE.md §3, lessons only,
// no code): wait for the very control you will use, never for "the page loaded"; only visible controls inside the
// viewport; when several match, the smallest box wins; after every step, read back the result and prove it.
import { until } from './cdp.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ the layer, injected into every page
const LAYER = String.raw`(() => {
  if (window.__agent) return;
  const root = document.createElement('div');
  root.id = '__agent_layer';
  root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:system-ui,"Segoe UI",Tahoma,sans-serif';
  root.innerHTML = '<div id="__ag_ring" style="position:fixed;border:3px solid #E07A3F;border-radius:10px;box-shadow:0 0 0 6px rgba(224,122,63,.18);opacity:0;transition:all .35s ease"></div>'
    + '<div id="__ag_cursor" style="position:fixed;left:-60px;top:-60px;transition:left .6s cubic-bezier(.2,.8,.2,1),top .6s cubic-bezier(.2,.8,.2,1)">'
    + '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M3 2l7 19 2.6-7.4L20 11z" fill="#1E2A2F" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    + '<span style="position:absolute;left:24px;top:22px;background:#E07A3F;color:#fff;font-size:13px;font-weight:700;padding:3px 9px;border-radius:12px;white-space:nowrap">الوكيل الذكي</span></div>'
    + '<div id="__ag_caption" style="position:fixed;left:50%;bottom:26px;transform:translateX(-50%);max-width:78vw;background:rgba(30,42,47,.94);color:#F6F3EE;font-size:20px;line-height:1.5;padding:12px 22px;border-radius:14px;direction:rtl;text-align:right;opacity:0;transition:opacity .3s;box-shadow:0 10px 30px rgba(0,0,0,.25)"></div>';
  const mount = () => document.body ? document.body.appendChild(root) : setTimeout(mount, 50);
  mount();
  const $ = (id) => root.querySelector('#' + id);
  window.__agent = {
    move(x, y) { const c = $('__ag_cursor'); c.style.left = (x - 4) + 'px'; c.style.top = (y - 3) + 'px'; },
    ring(r) { const g = $('__ag_ring'); if (!r) { g.style.opacity = 0; return; } Object.assign(g.style, { left: (r.x - 6) + 'px', top: (r.y - 6) + 'px', width: (r.w + 12) + 'px', height: (r.h + 12) + 'px', opacity: 1 }); },
    ripple(x, y) { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:' + (x - 18) + 'px;top:' + (y - 18) + 'px;width:36px;height:36px;border-radius:50%;background:rgba(224,122,63,.45);transform:scale(.3);transition:transform .45s ease,opacity .45s ease'; root.appendChild(d); requestAnimationFrame(() => { d.style.transform = 'scale(1.6)'; d.style.opacity = 0; }); setTimeout(() => d.remove(), 600); },
    say(text) { const c = $('__ag_caption'); if (!text) { c.style.opacity = 0; return; } c.textContent = text; c.style.opacity = 1; },
  };
})()`;

// ------------------------------------------------------------------ finding a control (runs in the page)
const FIND = String.raw`(spec) => {
  const vw = innerWidth, vh = innerHeight;
  const visible = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw; };
  const text = (e) => (e.innerText ?? e.textContent ?? '').replace(/\s+/g, ' ').trim();
  let cands = [];
  if (spec.css) cands = [...document.querySelectorAll(spec.css)];
  else if (spec.aria) cands = [...document.querySelectorAll('[aria-label="' + spec.aria + '"],[placeholder="' + spec.aria + '"]')];
  else if (spec.label) {
    // a form field: the smallest visible element whose own text is the label, then the first control near it
    const labels = [...document.querySelectorAll('label,span,div,p,th,legend')].filter((e) => visible(e) && text(e) === spec.label);
    labels.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height);
    for (const l of labels) { let p = l.parentElement; for (let i = 0; i < 3 && p; i++, p = p.parentElement) { const c = p.querySelector('input,textarea,select,[role=combobox]'); if (c && visible(c)) { cands = [c]; break; } } if (cands.length) break; }
  } else if (spec.text) {
    const want = spec.text, exact = spec.exact !== false;
    cands = [...document.querySelectorAll(spec.within ?? 'button,a,[role=button],[role=option],[role=menuitem],[role=tab],li,td,span,div')]
      .filter((e) => { const t = text(e); return t && (exact ? t === want : t.includes(want)) && t.length <= Math.max(want.length * 3, 60); });
  }
  cands = cands.filter(visible);
  if (!cands.length) return null;
  cands.sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return ra.width * ra.height - rb.width * rb.height; });
  const pick = spec.nth ? cands.sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return ra.top - rb.top || rb.left - ra.left; })[spec.nth - 1] : cands[0];
  if (!pick) return null;
  pick.scrollIntoView({ block: 'center', inline: 'nearest' });
  const mark = String(Math.random()).slice(2);
  pick.setAttribute('data-agent-pick', mark);
  const r = pick.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2, tag: pick.tagName, value: pick.value ?? null, mark };
}`;

/** Wraps a Page so the agent's actions are shown and paced for an audience. `pace` 0 = as fast as possible (tests). */
export function stage(page, { pace = 1, log = () => {}, onEvent = () => {}, captions = true } = {}) {
  // onEvent receives every visible move ({ type: say|point|click|type|done, box?, text? }) for the film editor;
  // captions false leaves the caption to the editor (it draws its own titles) while the cursor and ring stay on screen.
  const emit = (e) => { try { onEvent({ at: Date.now(), ...e }); } catch { /* the film is optional */ } };
  const wait = (ms) => (pace ? sleep(ms * pace) : Promise.resolve());
  const ensure = async () => { await page.evaluate(LAYER); };
  page.send('Page.addScriptToEvaluateOnNewDocument', { source: LAYER }).catch(() => {});

  // A control is ready when the same element is still in the page, at the same place, a moment later: a screen still
  // loading replaces or moves its controls, and a click on the old one is lost (seen at full speed on Mizan's lists).
  const STILL = `(m, x, y) => { const e = document.querySelector('[data-agent-pick="' + m + '"]'); if (!e || !e.isConnected) return false;
    const r = e.getBoundingClientRect(); return Math.abs(r.x - x) < 1 && Math.abs(r.y - y) < 1; }`;
  async function find(spec, timeout = 20_000) {
    await ensure();
    return until(async () => {
      const b = await page.call(FIND, spec);
      if (!b) return null;
      await sleep(150);
      return (await page.call(STILL, b.mark, b.x, b.y)) ? b : null;
    }, { timeout, what: 'the control ' + JSON.stringify(spec) + ' to be ready' });
  }
  async function point(spec) {
    const b = await find(spec);
    await page.evaluate(`__agent.ring(${JSON.stringify(b)}); __agent.move(${b.cx}, ${b.cy})`);
    emit({ type: 'point', box: b });
    await wait(650);
    return b;
  }
  const api = {
    page,
    /** Shows a caption (the agent says what it does and why). Empty text hides it. */
    async say(text) { await ensure(); if (captions) await page.evaluate(`__agent.say(${JSON.stringify(text ?? '')})`); emit({ type: 'say', text: text ?? '' }); log(text); await wait(text ? 900 : 0); },
    /** Marks a moment for the film (a result proven, a scene done); nothing changes on screen. */
    mark(type, data = {}) { emit({ type, ...data }); },
    find,
    /** Clicks a control. With `expect` (a page expression), proves the click did what it should, retrying once. */
    async click(spec, { expect, timeout = 8_000 } = {}) {
      for (let attempt = 1; ; attempt++) {
        const b = await point(spec);
        await page.evaluate(`__agent.ripple(${b.cx}, ${b.cy})`);
        emit({ type: 'click', box: b });
        await page.click(b.cx, b.cy);
        await wait(350);
        if (!expect) return b;
        try { await page.waitFor(expect, { timeout }); return b; } catch (e) {
          if (attempt >= 2) throw new Error(`clicking ${JSON.stringify(spec)} did not lead to ${expect}`);
          log(`(clicking ${JSON.stringify(spec)} changed nothing yet: clicking again)`);
        }
      }
    },
    /**
     * Clicks a field, clears it, types the value one character at a time, then reads the field back: a field that
     * reformats while typed (amounts, dates) can drop characters when typing outruns it. A mismatch is typed again,
     * slower; a field that still disagrees stops the run: a wrong number is never left behind silently.
     */
    async fill(spec, value, { cps = 16, check = true } = {}) {
      const want = String(value);
      const norm = (v) => String(v ?? '').replace(/[\s,٬']/g, '').replace(/\.0+$/, '');
      for (let attempt = 1; attempt <= 3; attempt++) {
        await api.click(spec);
        const mod = process.platform === 'darwin' ? 4 : 2;
        await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: mod, windowsVirtualKeyCode: 65 });
        await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: mod, windowsVirtualKeyCode: 65 });
        await page.key('Backspace');
        await sleep(80); // a field that reformats on focus swallows a key typed at once (185000 became 85000)
        // never faster than a quick typist, whatever the pace: controlled inputs need a moment per key
        const speed = Math.min(pace ? cps / pace : 40, 40) / attempt;
        emit({ type: 'type', text: want });
        await page.type(want, speed);
        await wait(250);
        if (!check) return;
        const got = await page.evaluate('document.activeElement && "value" in document.activeElement ? document.activeElement.value : null');
        const same = norm(got) === norm(want) || (norm(want) !== '' && !isNaN(Number(norm(want))) && Number(norm(got)) === Number(norm(want)));
        if (got === null || same) return;
        log(`(the field shows "${got}", not "${want}": typing it again, slower)`);
      }
      throw new Error(`the field ${JSON.stringify(spec)} would not take "${want}"`);
    },
    /** A search box that opens a list (account, customer, item pickers): type the search, then click the option. */
    async choose(spec, search, option, { cps = 16 } = {}) {
      await api.fill(spec, search, { cps });
      // the choice took when the list has closed (the picker shows the chosen value instead)
      await api.click({ text: option, within: '[role=option],[role=listbox] *,li', exact: false }, { expect: `![...document.querySelectorAll('[role=option]')].some((e) => e.getBoundingClientRect().height > 0)` });
    },
    async key(k) { await page.key(k); await wait(200); },
    async waitText(t, timeout = 20_000) { return until(() => page.evaluate(`document.body.innerText.includes(${JSON.stringify(t)})`), { timeout, what: `"${t}" on screen` }); },
    async clear() { await page.evaluate('window.__agent && (__agent.ring(null), __agent.say(""))'); },
    wait,
  };
  return api;
}
