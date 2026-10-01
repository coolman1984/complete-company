// Renders the film: the composer page is stepped frame by frame (it is a pure function of time), each frame is
// captured from a headless browser at 1920x1080, and ffmpeg (FFMPEG_PATH, or ffmpeg on the PATH; needs libx264 and
// aac) joins the frames and the synthesised soundtrack into an MP4 that plays on phones, WhatsApp and PowerPoint.
//   node agent/studio/render.mjs <show-take-dir> <fast-take-dir> <out.mp4> [--fps 30] [--from s --to s] [--crf 20]
//   node agent/studio/render.mjs --cut agent/studio/cuts/<film>.json --take <name>=<dir> ... <out.mp4>   (scene films)
// --fallback: also writes <out>-music.mp4, the same picture with the music only (to isolate any complaint about the effects)
// --crf: 17 archive quality, 20 default, 22 to share (WhatsApp, e-mail: two minutes stay under 25 MB)
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../cdp.mjs';
import { writeSoundtrack } from './audio.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const [showDir, fastDir, out0] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
// Scene films: --cut cuts/<film>.json --take <name>=<dir> ... <out.mp4> (composer-scenes.html); otherwise the journal film.
const CUT_FILE = opt('cut');
const TAKES = Object.fromEntries(args.map((a, i) => (args[i - 1] === '--take' ? a.split('=') : null)).filter(Boolean));
const out = CUT_FILE ? showDir : out0;
const FPS = Number(opt('fps', 30));
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const AFILTER = 'loudnorm=I=-16:TP=-1.5:LRA=7,alimiter=limit=0.84:level=disabled';   // calm pieces about -16 LUFS, true peak under -1 dBFS
const FONTS = process.env.FONTS_DIR ?? resolve(here, '../../../Accounting-sys/node_modules/@fontsource/ibm-plex-sans-arabic/files');
if (!out || (!CUT_FILE && (!showDir || !fastDir))) { console.error('usage: render.mjs <show-take-dir> <fast-take-dir> <out.mp4>\n   or: render.mjs --cut <cut.json> --take <name>=<dir> ... <out.mp4>'); process.exit(2); }

// ---- a small file server: the composer, the fonts, the two takes
const roots = CUT_FILE
  ? { ...Object.fromEntries(Object.entries(TAKES).map(([k, d]) => [`/takes/${k}/`, resolve(d)])), '/fonts/': FONTS, '/': here }
  : { '/takes/show/': resolve(showDir), '/takes/fast/': resolve(fastDir), '/fonts/': FONTS, '/': here };
const types = { '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.json': 'application/json', '.woff2': 'font/woff2', '.js': 'text/javascript' };
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const prefix = Object.keys(roots).find((p) => url.startsWith(p));
  const file = join(roots[prefix], url.slice(prefix.length));
  if (!file.startsWith(roots[prefix]) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'max-age=3600' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const take = (dir, name) => ({ ...JSON.parse(readFileSync(join(dir, 'footage.json'), 'utf8')), base: `/takes/${name}/` });
let cut;
if (CUT_FILE) {
  cut = JSON.parse(readFileSync(resolve(CUT_FILE), 'utf8'));
  const missing = cut.takes.filter((k) => !TAKES[k]);
  if (missing.length) { console.error('missing --take for: ' + missing.join(', ')); process.exit(2); }
  cut.takes = Object.fromEntries(cut.takes.map((k) => [k, take(TAKES[k], k)]));
  // a film never shows a figure the run did not produce
  for (const c of cut.checks ?? []) {
    const got = cut.takes[c.take].result?.[c.key];
    if (got !== c.equals) { console.error(`check failed: take ${c.take} ${c.key} is ${JSON.stringify(got)}, the cut says ${JSON.stringify(c.equals)}`); process.exit(1); }
  }
} else cut = { takes: { show: take(showDir, 'show'), fast: take(fastDir, 'fast') } };

const b = await launch({ profileDir: resolve(here, '../../../_agent-studio-browser'), headless: true });
let ff;
try {
  const page = await b.open(base + (CUT_FILE ? '/composer-scenes.html' : '/composer.html'), { width: 1920, height: 1080, scale: 1 });
  await page.evaluate('document.fonts.ready.then(() => true)');
  const T = await page.evaluate(`(() => { load(${JSON.stringify(cut)}); return CUT.T; })()`);
  console.log('timeline', JSON.stringify(T), CUT_FILE ? JSON.stringify(await page.evaluate('CUT.scenes.map((s) => [s.num, +s.card.toFixed(1), +s.main.toFixed(1), +s.mainEnd.toFixed(1)])')) : '');
  if (opt('stills')) { // design review: a few frames as PNG next to out, no film
    for (const t of opt('stills').split(',').map(Number)) {
      await page.evaluate(`renderAt(${t})`);
      const shot = await page.send('Page.captureScreenshot', { format: 'png' });
      const f = out.replace(/\.mp4$/, '') + `-still-${String(t).replace('.', '_')}.png`;
      (await import('node:fs')).writeFileSync(f, Buffer.from(shot.data, 'base64'));
      console.log('still', t, f);
    }
    await b.close(); server.close();
    process.exit(0);
  }
  const from = Number(opt('from', 0)), to = Math.min(Number(opt('to', T.end)), T.end);
  const frames = Math.round((to - from) * FPS);
  console.log(`film ${T.end.toFixed(1)} s, rendering ${from}-${to.toFixed(1)} s = ${frames} frames at ${FPS} fps`);

  // ---- soundtrack from the real moves
  let spec;
  if (CUT_FILE) spec = { duration: T.end, ...(await page.evaluate('cues()')) };
  else {
  const A = cut.takes.show, B = cut.takes.fast;
  const at = (seg, take, e) => T[seg] + e.t / 1000;
  const typing = [];
  for (const [seg, tk] of [['main', A], ['fast', B]]) {
    tk.events.forEach((e, i) => {
      if (e.type !== 'type' || !e.text) return;
      const next = tk.events.slice(i + 1).find((x) => x.t > e.t);
      const span = Math.min(((next?.t ?? e.t + 1000) - e.t) / 1000, e.text.length / 14 + 0.1);
      for (let c = 0; c < e.text.length; c++) typing.push(at(seg, tk, e) + (span * c) / e.text.length);
    });
  }
  spec = {
    duration: T.end,
    cuts: [T.card, T.main, T.speed, T.stats, T.outro].map((x) => x - 0.25),
    clicks: [...A.events.filter((e) => e.type === 'click').map((e) => at('main', A, e)), ...B.events.filter((e) => e.type === 'click').map((e) => at('fast', B, e))],
    typing,
    pops: A.events.filter((e) => e.type === 'balanced').map((e) => at('main', A, e) + 0.05),
    chimes: [...A.events.filter((e) => e.type === 'proven').map((e) => at('main', A, e) + 0.3), T.stats + 0.6],
  };
  }
  const wav = out.replace(/\.mp4$/, '') + '.wav';
  writeSoundtrack(wav, spec);

  if (opt('remux')) { // new sound on an already rendered picture: no frame is rendered again
    await new Promise((r, j) => spawn(FFMPEG, ['-y', '-loglevel', 'error', '-i', opt('remux'), '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', AFILTER, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', out], { stdio: 'inherit' }).on('exit', (c) => (c ? j(new Error('ffmpeg ' + c)) : r())));
    console.log('written', out); await b.close(); server.close(); process.exit(0);
  }
  ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', 'pipe:0',
    '-ss', String(from), '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(opt('crf', 20)), '-pix_fmt', 'yuv420p',
    '-af', AFILTER, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const started = Date.now();
  for (let i = 0; i < frames; i++) {
    const t = from + i / FPS;
    await page.evaluate(`renderAt(${t})`);
    const shot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 93, captureBeyondViewport: false });
    if (!ff.stdin.write(Buffer.from(shot.data, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`  ${(t).toFixed(1)} s (${Math.round((Date.now() - started) / 1000)} s elapsed)`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('exit', r));
  console.log('written', out);
  if (opt('fallback') !== undefined || args.includes('--fallback')) {   // same picture, music only: copy the video, mix the second track
    const wav2 = out.replace(/\.mp4$/, '') + '-music.wav', out2 = out.replace(/\.mp4$/, '') + '-music.mp4';
    writeSoundtrack(wav2, { duration: T.end });
    await new Promise((r, j) => spawn(FFMPEG, ['-y', '-loglevel', 'error', '-i', out, '-i', wav2, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', AFILTER, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', out2], { stdio: 'inherit' }).on('exit', (c) => (c ? j(new Error('ffmpeg ' + c)) : r())));
    console.log('written', out2);
  }
} finally {
  await b.close(); server.close();
}
