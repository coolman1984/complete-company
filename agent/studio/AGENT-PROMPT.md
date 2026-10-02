# Prompt: build a film studio and make one end-to-end product film

Copy everything below the line into a new agent session (Claude Code, Opus) opened on the target repository. Fill the five
`<…>` fields first. It is distilled from the studio in this folder (films 1–4) and the owner's feedback on them.

---

You are building a **film studio inside this repository** and then using it to make **one complete film** of the product
doing its whole process, from the first record to the last result, with sample data. The film is not a slideshow and not
generated footage: it is **the real application running in a real browser, driven by an agent (you, through code),
recorded, then edited into a polished film by code.** Every number on screen is real, read back from the application.

## Inputs (filled by the owner)
- **Product and process:** `<e.g. "trip orders: request → approve → driver link → odometer photos → close → Excel export">`
- **Viewer:** `<who watches, e.g. "the board of a transport company">` and their pain in one sentence: `<…>`
- **The one action after watching (end card):** `<e.g. "try it on one week of your own trips">`
- **Language and direction of the film text:** `<Arabic RTL / English>` · **length:** `<90–150 s>` · **brand colours:** `<two hex colours>`
- **Forbidden:** invented results (savings, customers, time saved), real company or person names, real data. The sample company
  is invented and the film says so on the first frame and on the end card.

## Phase 0 — read before you build (no code yet)
1. Read the repository's own rules (`CLAUDE.md`, contributing docs, tests). They win over this prompt on conventions.
2. Map the process: every screen a person uses, in order, and the API that proves each step happened. Write it as a table.
3. Write `studio/BRIEF.md`: viewer, problem, the one action, what is **provably true** (each line: which API read proves it),
   what is **staged** and how the film admits it (e.g. "the clock is a studio clock"), what is never claimed, length, brand.
4. Write the **storyboard** in the same file: a table `time → what the viewer sees → business job of the beat → what survives
   into the next beat`. Choose **one persistent actor** (one order / one trip / one invoice) that the whole film follows.
   Then check the storyboard yourself: chronology matches the real process, each number exact, compositions not all alike.
   Stop and show me the brief and storyboard before Phase 2.

## Phase 1 — the stage (an agent that works the real screens)
Build in plain Node (no framework needed), controlling Chromium through the **Chrome DevTools Protocol** over a websocket:
- `cdp` module: launch the browser with its own profile directory, open a page at a fixed viewport, `evaluate`, `waitFor`
  (poll until a condition is observed; **never fixed sleeps**), keyboard and mouse input.
- `stage` module — the agent's hands, visible to the viewer:
  - a drawn **cursor** injected into the page that moves along an eased path to the target, and a **ring** that pulses on click;
  - `say(text)` — a caption bubble (the agent's narration), `mark(name, data)` — an invisible event the editor uses later;
  - `click(target, { expect })` — find by **visible text or label**, smallest visible box wins, scroll into view, click, then
    wait until the expected thing appears; `fill(field, value)` — type character by character, then **read the value back**;
    `choose(select, label)` — pick by label, not by index.
  - every action emits an event with its timestamp (point, click, type, say, mark).
- **Skills** per screen group (`skills/<area>.mjs`): `createOrder`, `approve`, `openReport`… each one ends by proving its
  result through the API (`GET` the record, compare fields). A take that cannot prove its result fails.
- **The set** (`sets/<film>.mjs`): starts the application in-process on a temporary database, on a **studio clock** (a fixed
  day and time; override the browser's `Date` with an init script so screens agree), and builds the sample world **through
  the application's own APIs** (never by writing the database): the invented company, users, master data, and everything
  that happens off camera. On camera, only the screens do the work.

## Phase 2 — shoot
- `record` module: `Page.startScreencast` (JPEG, full device-pixel size), save every frame with its time, plus the stage events,
  into `takes/<scene>/footage.json`. One take per scene/chapter, each starting from a known state.
- Record at a **readable size**: viewport ~1280×800 at device scale 1.5 (text must be legible in a 1080p film).
- Before a take ends, read back every figure the film will show and store it in the take (`result`).
- Fix the screen, not the film: if a button is off-screen, scroll first; if text is too small, change the viewport.

## Phase 3 — edit (the composer)
An HTML page `composer.html` that draws the film with a **pure function `renderAt(t)`** (no timers, no CSS animations
running on their own): given a time in seconds it places everything deterministically. It reads a **cut file**
`cuts/<film>.json`: scenes (take, in/out times, chapter title), steps, stamps (big confirmed numbers), badges, the
persistent actor card and its chips, stats, outro.
Visual grammar (learned the hard way):
- **Frame 0 is a finished composition** (title already on screen; no fade from black).
- The real app sits in a clean window on a dark stage with brand colours; the frames are played back by their timestamps.
- **Camera still and wide.** At most a 3–4 % zoom on a detail, eased with a soft spring; a slow 3 % push over each reading
  hold keeps it alive. **Never chase the cursor, never zoom in and out quickly** (the owner rejected that film).
- **The foreground becomes the transition:** the next chapter title enters while the previous window leaves; no 3-second
  title slides, no black gaps. One fade only, at the very end.
- The persistent actor card stays on screen all film; its chips fill in as each step is proven (cause → effect).
- Stamps for the numbers that matter, placed so they never cover the table they summarise.
- Text in the film's language; RTL layout by logical properties; one font family with good Arabic (e.g. IBM Plex Sans Arabic).
- Prefer screens that **move**: live counters, progress, boards, reports filling in. Tables need a reading hold.

## Phase 4 — sound and render
- `audio` module: synthesise the music bed and effects in code (no licence issues): one **soft whoosh per transition**
  (~0.35 s, nothing below ~200 Hz), quiet clicks only on real clicks (from the stage events), very light typing ticks.
- `render` module: load the composer in headless Chromium, step `t` by 1/30 s, screenshot each frame, pipe into **ffmpeg**
  (H.264 1920×1080 30 fps, AAC 256 k). Audio chain: limiter → `loudnorm=I=-16:TP=-1.5` → limiter.
  Also write a **music-only fallback** version. Before rendering, check that every figure in the cut equals the take's
  read-back result; refuse to render on a mismatch.
- `measure` module: loudness, true peak, **frozen time** (seconds per 30 s where nothing changes), and a contact sheet
  (one frame every few seconds in a grid). Report the numbers; do not argue with them.

## Phase 5 — judge (builder ≠ judge)
- Look at the contact sheet and at least 10 full frames yourself: legibility, nothing covered, nothing cut off, right language.
- If I allow it, run an **independent critic** (a fresh agent that never saw the code) on the rendered film with the brief;
  record round → findings → changes → numbers in `studio/<film>/LEDGER.md`; repeat until no blocking finding.

## Deliverables
`studio/` (cdp, stage, record, composer, audio, render, measure, sets, skills, cuts, BRIEF, LEDGER, a CRAFT.md of the rules
you followed), the film `.mp4` + music-only `.mp4` + contact sheet, and one command that re-shoots and re-renders the whole film
from nothing. Takes, frames and videos are **git-ignored**; commit only code and documents. Tests and lint of the repo stay green.

## Pitfalls already paid for
- A field named like the timestamp (`at`) silently overwrote it → keep event fields distinct.
- The studio "today" was before the working day started → start the clock inside working hours.
- A custom picker was not a real `<select>` → choose by visible label.
- Stamps covered the very table they described → reserve a stamp zone.
- AAC encoding pushed the true peak to −0.1 dB → limiter after loudness normalisation, 256 k.
- Too much zoom made the film blurry and tiring → still, wide camera.

Report progress briefly after each phase, and show me the brief + storyboard and then the first full render before polishing.
