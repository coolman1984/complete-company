# Film 4 ledger (round → artifact → findings → change → measured)

Honest limits: the findings below are the builder's own reading of stills, a contact sheet and measurements. **No independent
critic has judged this film yet** (the kit's rule "builder ≠ judge" is not met); no human has listened to the sound.

| Round | Artifact | Findings | Change | Measured |
|---|---|---|---|---|
| 0 | films 2 and 3 (baseline) | clipping, black first frame, 3-second title slides, frozen time | recorded in `../CRAFT.md` | film 2: frozen 22 s/30 s, true peak **+0.3** dBFS; film 3: 21 s/30 s, −20.2 LUFS |
| 1 | film 4, first render (115 s) | the "stamp" hid the table being read (orders, lots); the applications' text was small at 1456 px (1600×1000 page); holds up to 6 s; true peak +0.1 | stamp moved below the tables (`stampTop`); page recorded at 1280×800 (text 25 % larger); holds trimmed | frozen 21.1 s/30 s, longest hold 6.2 s, −16.1 LUFS, true peak +0.1 dBFS |
| 2 | film 4, second render (105 s) | true peak still +0.1: found by decoding the delivered file — the AAC encoder turned a −3.1 dBFS peak into −0.1 dBFS | limiter → loudnorm → limiter, AAC 256k | frozen **20.0 s/30 s**, longest hold 4.4 s, **−16.0 LUFS**, true peak **−3.9 dBFS**; music-only version −15.9 LUFS, −5.5 dBFS |

## Open, in order of importance
1. **Frozen time is far above the kit's bar** (≤ ~1 s per 30 s). The bar is made for motion graphics; a screen film has
   tables and forms that must be read, so most of it is "static" by the metric. Reduced from 22 to 20, not solved. What would
   move it: cutting every reading hold to ~2 s (readability suffers), or compositing real motion over the holds (callouts that
   draw, rows that highlight in turn) — a design decision for the owner.
2. An independent critic (fresh agent or person) on the render, then a verification round.
3. The sound was never listened to by a person; it is synthesised (no licence), and the kit found licensed human-made music
   beats generated scores.
4. Four of five screens are tables (the weakest point of a screen demo for "variety of compositions").
