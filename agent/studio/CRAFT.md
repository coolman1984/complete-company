# Film craft: what the studio takes from the motion-video-kit

Source: `github.com/echris6/motion-video-kit` (MIT; a Claude Code skill for premium business commercials, built from 28
launch films and two full worked films). This note keeps what applies to **our** films (screen films of the agent working in
real applications) and says how the studio now does it. The kit's text is not copied; the ideas are, with credit.

## The rules we adopted

| Rule (kit) | What it means for a screen film | Where it lives |
|---|---|---|
| **Truth first.** No invented results; a concept film says it is one | The company is invented and says so on frame 0 and on the end card; every figure is read back from the applications before the take ends; what is staged is written in the film's brief | `film4/BRIEF.md`, cut `checks`, intro kicker, `outro.sign` |
| **Business purpose on mute** | One clear next action on the end card ("جرّب طلب حقيقي من مصنعك") | `outro.cta` |
| **Brief and storyboard before building**, with a storyboard check | A table: time → what is seen → business job → what survives into the next beat | `film4/BRIEF.md` |
| **One persistent actor** | The customer's order is a card in the side panel for the whole film; its steps fill in as the applications do their part | cut `thread`, composer `#thread` |
| **The foreground becomes the transition; no empty gap** | The chapter title enters as the previous window leaves (no 3-second title slide, no black) | composer `cardLen`, `t = mainEnd` |
| **Frame 0 is a finished composition** | The intro is complete at the first frame; no fade from black | composer intro block, `#fade` |
| **Change speed; don't drift** / **a slow 3–5 % push keeps a reading hold alive** | A 3 % push over each scene; the camera never chases the cursor (the owner's notes on film 2 agree) | composer window transform |
| **Measure, don't argue** | Frozen time, loudness, true peak, a contact sheet | `measure.mjs` |
| **Builder ≠ judge** (the Gauntlet loop) | A fresh critic reads the render and a ledger records round → findings → changes → numbers | `film4/LEDGER.md` (an independent critic is still to be run: see there) |
| **Sound: music matched to the buyer, one soft rumble-free whoosh per transition, clean sounds only on real actions, a music-only fallback** | Whoosh: 0.38 s, nothing under ~200 Hz; ticks quieter; loudness −16 LUFS, true peak ≤ −1.5 dBFS; `--fallback` writes the music-only film | `audio.mjs`, `render.mjs` |

## What we did not adopt, and why
- **3 Three.js scenes, AI footage, 60 fps motion graphics:** our films are the real applications; nothing is generated.
- **A 30 s ad:** a screen film needs readable holds (tables, forms), so ours run 1.5–2.5 minutes. The frozen-time target of the kit
  (≤ ~1 s per 30 s) is for motion graphics; for screens we report the number and reduce it (see the ledger), we do not hide it.
- **Library music:** the kit found human-made library tracks beat generated ones. Ours is synthesised (no licence to carry);
  swapping in a licensed track is a decision for the owner.

## Measurements (baseline, 2026-10-01, before the changes)
Film 2 (second cut): frozen 22 s per 30 s, true peak **+0.3 dBFS** (clipping), −20.4 LUFS. Film 3: frozen 21 s per 30 s, −20.2 LUFS,
true peak −0.7 dBFS. Both fail the kit's bar; the true-peak defect and the black first frame are fixed in the studio for every film
from now on (film 4 onward); films 2 and 3 can be re-rendered from their takes without re-shooting.
