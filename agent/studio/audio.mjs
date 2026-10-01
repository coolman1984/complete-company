// The film's sound, synthesised here so it carries no licence: a warm pad with a soft arpeggio underneath, and sound
// effects placed on the agent's real moves (a click on every click, soft key ticks while it types, a whoosh on every
// transition, a pop when the entry balances, a chime when it is proven). Deterministic: a seeded noise source.
// Sound rules from the motion-video-kit (echris6, MIT): one short, soft, rumble-free whoosh per real transition (little energy
// under ~200 Hz, a gentle rise, a quarter of a second); small clean sounds only on real actions; the music carries the film.
// Loudness is set by the renderer (-16 LUFS integrated, true peak <= -1.5 dBFS); a music-only version is always delivered too.
import { writeFileSync } from 'node:fs';

const RATE = 48_000;

export function soundtrack({ duration, cuts = [], clicks = [], typing = [], pops = [], chimes = [], bpm = 96 }) {
  const n = Math.ceil(duration * RATE);
  const L = new Float32Array(n), R = new Float32Array(n);
  let seed = 20260930;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const add = (i, l, r = l) => { if (i >= 0 && i < n) { L[i] += l; R[i] += r; } };

  // ---- pad: four chords, crossfaded, two slightly detuned voices per note (width), slow swell
  const chords = [[110, 164.81, 220, 261.63, 329.63, 493.88], [87.31, 130.81, 174.61, 220, 329.63, 392], [130.81, 196, 261.63, 329.63, 392, 493.88], [98, 146.83, 196, 246.94, 293.66, 440]];
  const bar = (60 / bpm) * 4 * 2; // two bars per chord
  for (let i = 0; i < n; i++) {
    const t = i / RATE, ci = Math.floor(t / bar), f = (t % bar) / bar;
    const env = Math.min(1, t / 3) * Math.min(1, (duration - t) / 2.5);
    let l = 0, r = 0;
    for (const [k, w] of [[ci, f < 0.85 ? 1 : 1 - (f - 0.85) / 0.15], [ci + 1, f < 0.85 ? 0 : (f - 0.85) / 0.15]]) {
      if (w <= 0) continue;
      for (const hz of chords[k % chords.length]) {
        l += w * Math.sin(2 * Math.PI * hz * 0.998 * t) * 0.5 + w * Math.sin(2 * Math.PI * hz * 2 * t) * 0.06;
        r += w * Math.sin(2 * Math.PI * hz * 1.002 * t) * 0.5 + w * Math.sin(2 * Math.PI * hz * 2.003 * t) * 0.06;
      }
    }
    const swell = 0.85 + 0.15 * Math.sin(2 * Math.PI * t / 9);
    L[i] += l * 0.028 * env * swell; R[i] += r * 0.028 * env * swell;
  }
  // ---- arpeggio: soft plucks on eighth notes, from the chord of the moment
  const eighth = 60 / bpm / 2;
  for (let s = 0, k = 0; s < duration - 1; s += eighth, k++) {
    if (s < 1.5) continue;
    const chord = chords[Math.floor(s / bar) % chords.length];
    const hz = chord[[2, 3, 4, 5, 4, 3][k % 6]] * 2;
    const vel = (k % 4 === 0 ? 0.11 : 0.07) * Math.min(1, (duration - s) / 3);
    const start = Math.floor(s * RATE), len = Math.floor(0.5 * RATE), pan = 0.5 + 0.3 * Math.sin(k * 0.9);
    for (let j = 0; j < len; j++) { const x = Math.sin(2 * Math.PI * hz * j / RATE) * Math.exp(-j / (0.12 * RATE)) * vel; add(start + j, x * (1 - pan) * 2 * 0.5, x * pan * 2 * 0.5); }
  }
  // ---- effects
  for (const t of clicks) { const s = Math.floor(t * RATE); let prev = 0; for (let j = 0; j < 0.012 * RATE; j++) { const w = rnd(); const hp = w - prev; prev = w; const x = hp * 0.16 * Math.exp(-j / (0.0025 * RATE)) + Math.sin(2 * Math.PI * 2100 * j / RATE) * 0.035 * Math.exp(-j / (0.002 * RATE)); add(s + j, x); } }
  for (const t of typing) { const s = Math.floor(t * RATE); let prev = 0; for (let j = 0; j < 0.006 * RATE; j++) { const w = rnd(); const hp = w - prev; prev = w; add(s + j, hp * 0.035 * Math.exp(-j / (0.0012 * RATE))); } }
  // a soft "air pass": 0.38 s of noise whose upper edge rises from ~600 Hz to ~3.5 kHz, with everything under ~200 Hz taken out
  for (const t of cuts) { const s = Math.floor(t * RATE), len = Math.floor(0.38 * RATE); let hi = 0, lo = 0; for (let j = 0; j < len; j++) { const p = j / len, w = rnd(); hi += (1 - Math.exp(-2 * Math.PI * (600 + 2900 * p * p) / RATE)) * (w - hi); lo += 0.0258 * (w - lo); const a = Math.sin(Math.PI * p) ** 2 * 0.2; const x = (hi - lo) * a; add(s + j, x * (1 - p * 0.5), x * (0.5 + p * 0.5)); } }
  for (const t of pops) { const s = Math.floor(t * RATE); let ph = 0; for (let j = 0; j < 0.12 * RATE; j++) { const p = j / (0.12 * RATE); ph += 2 * Math.PI * (420 + 700 * p) / RATE; add(s + j, Math.sin(ph) * 0.16 * (1 - p) ** 2); } }
  for (const t of chimes) { const s = Math.floor(t * RATE); for (const [hz, a, d] of [[880, 0.12, 1.2], [1318.51, 0.09, 1.0], [1760, 0.05, 0.7]]) for (let j = 0; j < d * 1.5 * RATE; j++) add(s + j, Math.sin(2 * Math.PI * hz * j / RATE) * a * Math.exp(-j / (d * 0.35 * RATE))); }

  // ---- master: soft-knee compression (tanh), then normalised to -1 dBFS peak: a film is mastered loud and even
  let peak = 0; for (let i = 0; i < n; i++) { L[i] = Math.tanh(L[i] * 2.2) / 2.2; R[i] = Math.tanh(R[i] * 2.2) / 2.2; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
  const g = peak > 0 ? 0.89 / peak : 1;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4); }
  return buf;
}

export function writeSoundtrack(file, spec) { writeFileSync(file, soundtrack(spec)); return file; }
