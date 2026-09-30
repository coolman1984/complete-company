// The film's raw footage: every frame the browser paints while the agent works (Page.startScreencast, JPEG at the
// window's full pixel size so the editor can zoom in sharply), each with its time, plus every visible move of the agent
// (stage events: point, click, type, say, balanced, proven). Nothing is staged for the camera: this is the real run.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** Films page while fn runs. fn receives { onEvent } to hand to stage(). Writes dir/frames/*.jpg + footage.json. */
export async function film(page, dir, fn, { quality = 88 } = {}) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'frames'), { recursive: true });
  const t0 = Date.now();
  const frames = [], events = [];
  let n = 0;
  const onFrame = (m) => {
    if (m.method !== 'Page.screencastFrame') return;
    const file = `frames/${String(++n).padStart(5, '0')}.jpg`;
    writeFileSync(join(dir, file), Buffer.from(m.params.data, 'base64'));
    frames.push({ t: Date.now() - t0, file });
    page.send('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {});
  };
  page.conn.listeners.add(onFrame);
  const size = await page.evaluate('({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio })');
  await page.send('Page.startScreencast', { format: 'jpeg', quality, maxWidth: Math.round(size.w * size.dpr), maxHeight: Math.round(size.h * size.dpr), everyNthFrame: 1 });
  let result, error;
  try { result = await fn({ onEvent: (e) => events.push({ ...e, t: e.at - t0 }) }); } catch (e) { error = e; }
  await new Promise((r) => setTimeout(r, 600)); // the last paint
  await page.send('Page.stopScreencast').catch(() => {});
  page.conn.listeners.delete(onFrame);
  const footage = { duration: Date.now() - t0, viewport: size, frames, events, result: result ?? null, error: error ? String(error.message) : null };
  writeFileSync(join(dir, 'footage.json'), JSON.stringify(footage, null, 1));
  if (error) throw error;
  return footage;
}
