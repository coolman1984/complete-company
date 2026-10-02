// Measures a rendered film, the way the film studio's quality bar asks (idea and thresholds from the MIT-licensed
// "motion-video-kit" by echris6, re-written here in Node so it runs wherever the studio runs; ffmpeg from FFMPEG_PATH or the PATH).
//   node agent/studio/measure.mjs film.mp4 [--sheet out.jpg] [--every 2] [--frozen 0.35]
// Prints: duration; frozen time (frame-to-frame difference under a threshold, sampled at 10 fps, with the longest hold);
// integrated loudness, loudness range and true peak; the short-term loudness each 5 s; optionally a contact sheet.
// Targets (quality-bar): frozen time <= ~1 s per 30 s and no single hold > 0.6 s except the last card; calm pieces about
// -16 LUFS, true peak <= -1 dBFS; loudness range 1.5-3 LU is fine for a calm score.
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && !['--sheet', '--every', '--frozen'].includes(args[args.indexOf(a) - 1]));
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
if (!file) { console.error('usage: measure.mjs film.mp4 [--sheet out.jpg] [--every 2] [--frozen 0.35]'); process.exit(2); }
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const run = (a) => spawnSync(FFMPEG, ['-hide_banner', ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });

const info = run(['-i', file]).stderr;
const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(info);
const seconds = dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : 0;
console.log(`file      ${file}\nduration  ${seconds.toFixed(1)} s`);

// frozen time
const th = Number(opt('frozen', 0.35));
const fr = run(['-i', file, '-vf', 'fps=10,scale=320:-1,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-an', '-f', 'null', '-']).stderr;
const ys = [...fr.matchAll(/YAVG=([0-9.]+)/g)].map((m) => Number(m[1]));
const holds = []; let start = null;
ys.forEach((y, i) => { if (y < th) { if (start === null) start = i; } else if (start !== null) { holds.push([start, i]); start = null; } });
if (start !== null) holds.push([start, ys.length]);
const frozen = ys.filter((y) => y < th).length / 10;
const longest = holds.reduce((m, [a, b]) => (b - a > m[1] - m[0] ? [a, b] : m), [0, 0]);
console.log(`frozen    ${frozen.toFixed(1)} s of ${seconds.toFixed(1)} s (${((frozen / seconds) * 30).toFixed(1)} s per 30 s); longest hold ${((longest[1] - longest[0]) / 10).toFixed(1)} s at ${(longest[0] / 10).toFixed(1)} s`);
console.log('holds > 0.6 s: ' + (holds.filter(([a, b]) => b - a > 6).map(([a, b]) => `${(a / 10).toFixed(1)}-${(b / 10).toFixed(1)}`).join('  ') || 'none'));

// loudness
const lo = run(['-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr;
const last = (re) => { const m = [...lo.matchAll(re)]; return m.length ? m[m.length - 1][1] : 'n/a'; };
console.log(`loudness  I ${last(/I:\s+(-?[\d.]+) LUFS/g)} LUFS   LRA ${last(/LRA:\s+([\d.]+) LU/g)} LU   true peak ${last(/Peak:\s+(-?[\d.]+) dBFS/g)} dBFS`);
const st = [...lo.matchAll(/t:\s*([\d.]+)\s.*?S:\s*(-?[\d.]+)/g)].filter((m) => Math.round(Number(m[1]) * 10) % 50 === 0).map((m) => `${Math.round(Number(m[1]))}s:${m[2]}`);
console.log('short-term each 5 s: ' + st.join('  '));

const sheet = opt('sheet');
if (sheet) {
  const every = Number(opt('every', 2));
  const cols = 6, rows = Math.ceil(seconds / every / cols);
  run(['-loglevel', 'error', '-y', '-i', file, '-vf', `fps=1/${every},scale=480:-1,tile=${cols}x${rows}`, '-frames:v', '1', sheet]);
  console.log('sheet     ' + sheet);
}
