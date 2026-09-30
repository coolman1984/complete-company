# 70 — Agent showcase: one order, the whole company, driven by an AI agent

Version 1.0 · 2026-09-30 · Owner's idea (with an outside assistant's first plan), checked against the code and improved.
Builds on `60-CERAMIC-PITCH.md` (the ceramic demo company and its chain).

**Goal.** In front of a board, an AI agent takes a customer order and moves it through Mizan, GMES, HR and Space Planner:
order, forecast and targets, MRP, purchasing, shifts and labour, production and quality, a surprise, container loading
in 3D, shipping, revenue, month-end review, financial statements and tax summary, a management summary. The board sees
**speed, accuracy and low cost, each measured, not claimed.**

## 1. The five rules that make it credible

1. **The agent orchestrates; the engines calculate.** MRP is GMES's, postings are Mizan's ledger, container loading is
   Space Planner's packer, pay is Mizan/HR's. The agent reads, decides, records through the official APIs and explains.
   **It never types a number it did not get from a tool.** That is where accuracy comes from.
2. **Accuracy is proven by someone else.** After the run, the existing cross-system verifier (`scenario/verify`)
   checks quantities, values, lots and headcount across the apps and shows its checks on screen. The agent does not
   grade itself.
3. **Speed and cost are measured.** Wall-clock time, number of tool calls, records created, tokens and money are read
   from the run itself and shown live. No comparison with manual work is claimed; that is what the pilot measures.
4. **People approve what commits the company.** The agent prepares; a person approves: purchase orders, journal
   postings, payroll, the month-end review, anything sent to the tax authority. Each approval is a real status in the
   app, and every record shows who did it: the agent has its own user in each app, with a limited role and no admin
   right.
5. **Real facts come from the floor.** Produced quantities, defects and stoppages are entered by an operator (in the
   demo: the presenter, on a tablet or a second window) or by a machine. The agent never invents production.

## 2. What exists, checked in the code (2026-09-30)

✅ on GitHub `main` · 🟡 on the owner's PC only (not pushed; the chains need it) · 🔨 to build

| Scene | What the agent does | Engine | State |
|---|---|---|---|
| 1 Order | Reads the customer message, records the sales order, asks for anything missing | Mizan sales orders, ATP | ✅ |
| 2 Forecast and targets | Builds next months' demand plan from history, sets the monthly targets | Mizan S&OP versions (baseline months), budgets | ✅ (needs 3 months of history: seed) |
| 3 MRP | Runs MRP, reads requisitions, planned orders, crew needs | GMES planning | 🟡 |
| 4 Purchasing | Turns requisitions into purchase orders → **approval** | Mizan requisitions, PO approve | ✅ |
| 5 People | Shifts and schedule for the line, staffing gap, who is qualified | HR shifts, schedule, qualifications; staffing gap | ✅ / 🟡 |
| 6 Production and quality | Releases the work order, watches the floor: output by shade lot, losses by reason, stoppages, OEE, inspection | GMES exe, QMS, OEE, reports | ✅ (batch path proven) / 🟡 incoming lots |
| 7 Expenses | Records the month's operating expenses (energy, maintenance) as journals → **approval** | Mizan journal, recurring | ✅ |
| 8 **Surprise** | Part of a batch fails inspection: the agent recomputes available m², delivery date, cost and margin, proposes options → **decision** | GMES QMS + Mizan ATP/cost | 🔨 (tools exist; the reasoning is the agent's) |
| 9 Container 3D | Takes carton sizes and weights from the items, plans the containers, shows them loaded in 3D with playback; tiles fill a container **by weight before volume** | Space Planner `plan_shipment` / `pack_container` (payload per container type) | ✅ (link from item data 🔨) |
| 10 Ship and bill | Delivery by shade lot, invoice, e-invoice queued (test mode only), revenue recognised | Mizan deliveries, invoices, e-invoice | ✅ |
| 11 Month-end review | Runs a close checklist: payroll posted, depreciation, recurring entries, WIP cleared, bank reconciled, trial balance balanced, advisor findings → **approval** | Mizan (no monthly period lock exists: a review, not a lock) | 🔨 checklist tool |
| 12 Statements and tax | Income statement, balance sheet, cash flow, VAT tax summary, withholding | Mizan reports | ✅ |
| 13 Management summary | One page in Arabic: what happened, KPIs vs target, risks, next month's forecast, each number linked to its source | the agent | 🔨 |

## 3. Architecture (no new dependency)

```
 presenter ── cockpit page (portal, 127.0.0.1:4500/agent) ── SSE ──┐
                │ approve / reject                                 │ events: step, tool call, record, approval, cost
                ▼                                                  │
          agent runner (Node) ── launches the model ──► company MCP server (Node, stdio, zero dependency)
                                                           │ tools = official HTTP APIs, agent's own key/user
                                   ┌───────────────┬───────┴──────┬──────────────────┐
                                 Mizan           GMES          HR-System        Space Planner
```

- **Same pattern as Space Planner** (`3D-Modeling/apps/server/src/agents.ts`, `mcp.ts`): the runner starts Claude Code
  (`claude -p --mcp-config … --strict-mcp-config --allowedTools mcp__company --output-format stream-json`) or calls the
  Messages API directly with `fetch` (no SDK). Both report tokens and duration, which the scoreboard shows.
- **Company MCP server** in `complete-company/agent/`: about 30 tools grouped by scene, each one official API call or a
  small fixed sequence, returning compact JSON. Tools refuse what the agent's role may not do (approve, post, delete).
  Every write carries a command id, so a repeated call never duplicates.
- **Cockpit** (Arabic first, RTL, EN switch): right, the order and the agent's narration; middle, the scene timeline with
  each step's state; left, the document the step produced (with "open in the app"); bottom, the scoreboard: time,
  tool calls, records, cost, verifier checks. Approval cards appear in the timeline; the presenter clicks.
- **Two modes:** *Live* (the real model now) and *Replay* (a real recorded run played back with its real timings and
  cost, labelled on screen "تسجيل لتشغيل حقيقي بتاريخ …"). Replay is the safety net: no internet or a slow model does
  not stop the meeting.

## 4. Build order (each step ends green before the next)

| Step | Work | Done when |
|---|---|---|
| **B0** | **Owner pushes the local work** of GMES, Mizan, HR (planning, incoming lots, peers, gmes-wip, staffing gap) | `Start-Ceramic-Demo.bat` passes here from GitHub |
| B1 | Seed: the ceramic company + 3 months of small history (deterministic), agent user and key in each app | forecast and statements have real numbers |
| B2 | Company MCP server, tools for scenes 1, 3, 4, 6, 9, 10 | each tool tested against the running apps |
| B3 | Runner + event stream + cost/time measurement | a run prints its steps, tokens, time |
| B4 | Cockpit page: timeline, approvals, scoreboard, replay | the MVP runs end to end in the page |
| **MVP** | Order → MRP → purchase (approve) → production and quality → **surprise** → container 3D → invoice and margin | live run + recorded replay; verifier green |
| B5 | Scenes 2, 5, 7, 11, 12, 13 (forecast and targets, people, expenses, close review, statements and tax, summary) | full run; verifier green |
| B6 | Rehearsal: timings, a 10-minute cut (live for 3 scenes, replay for the rest), backup screenshots in the deck | owner rehearses once on Windows |

The surprise is in the MVP: it is the strongest moment (the agent shows judgement, not just speed).

## 5. The demo cut (10 minutes)

| Min | Scene | Mode |
|---|---|---|
| 0–1 | The order arrives as a customer message (WhatsApp-style text) | live |
| 1–3 | MRP, purchase order waiting for approval; the presenter approves | live |
| 3–5 | Production and quality on the floor; the presenter enters a rejection → the agent recomputes and proposes | live |
| 5–7 | Container loaded in 3D (weight, not volume, is the limit), shipping, invoice, margin | replay or live |
| 7–9 | Month-end review, statements, tax summary, forecast and targets for next months, the management page | replay |
| 9–10 | Scoreboard: time, cost of the whole run, verifier checks all green | — |

## 6. Risks and what we do

| Risk | Handling |
|---|---|
| A live run is slower than the slot | 10-minute cut above; replay of a real run |
| No internet at the factory | Replay works offline; the apps run on the laptop |
| The agent makes a wrong call | Approvals stop anything that commits the company; the verifier shows any mismatch in red, and we say so |
| "Is the agent really doing it?" | The timeline shows every tool call and the record it made; open any record in its app |
| E-invoice or tax filing | Test mode only; nothing is ever sent to the tax authority from a demo |
| Space Planner's sample list includes other sample companies | The demo opens the ceramic shipment directly. (The electronics sample is now an invented company, Horizon Electronics.) |
| Month-end "close" | Mizan closes fiscal years, not months: call it a month-end **review**, never a lock |

## 7. Open decisions for the owner

1. **Model access for the demo:** Claude Code signed in on the laptop, or an API key (cleanest cost figure per run).
2. **Surprise scene:** a rejected batch (default) or a customer who moves the date earlier.

## 8. Driving the real screens (owner's decision, 2026-09-30)

**Every scene happens in the applications' own screens, live:** the audience sees the agent's cursor glide to each
field, a ring around the control it works on, the words typed one character at a time, the entry posted, the report
refreshed, and a caption saying what it does and why. It is not a video: anyone can click in the same window, and a
board member can dictate a number that the agent then types.

```
 model (decides what to do next) ──► skills (one per screen task: signIn, openScreen, recordJournal, …)
                                         │ each step on the stage, each result proven through the app's API
                                         ▼
                                     stage (agent/stage.mjs: cursor, ring, ripple, caption, typing, read-back)
                                         ▼
                                     cdp (agent/cdp.mjs: Chrome/Edge over DevTools, zero dependency, own profile)
```

- The model never hunts for pixels: it calls skills. Its freedom is in the decisions, not in where to click. That keeps
  a live run fast and predictable.
- **Rules carried over from an earlier automation project** (lessons only, no code): wait for the very control you will use;
  visible controls only, smallest box wins; every click that must change the screen proves it did (`expect`), retrying
  once; every typed field is read back and retyped slower on a mismatch; a failure saves a screenshot; own browser
  profile, never the user's; 127.0.0.1, never "localhost"; the browser is told to call nobody (works unplugged).
- **Replay becomes live too:** the decisions of a real model run are recorded; on stage the skills execute them in the
  real screens now. No internet needed, nothing pre-filmed.
- **Two speeds:** presentation pace (the audience can follow) and full speed (the same work when nobody watches).

### 8.1 Proven so far

| Skill | Result | Proof |
|---|---|---|
| Mizan `signIn`, `openScreen`, `recordJournal` (kiln electricity 185,000 EGP: Dr 5230 utilities / Cr 2130 accrued), then the income statement | **Posted JE-000001 at presentation pace in 31 s, at full speed in 6.4 s (4 runs of 4, no retry)** | read back through `GET /api/journal/:id`: new, posted, debit = credit; filmed from the browser (webm) |

Four real defects were caught by running at full speed, and are now rules in `stage.mjs` / `skills/mizan.mjs`:
1. "غير متوازن" (not balanced) contains "متوازن" (balanced): a text check passed before the entry balanced. The skill now
   waits for the warning to disappear **and** the post button to be enabled.
2. An amount field that reformats as you type dropped characters when typing outran it (185000 became 000). Every
   field is now read back; a mismatch is retyped slower; a field that still disagrees stops the run.
3. The same field swallowed the first key typed right after focusing it (185000 became 85000): a short pause after
   clearing a field, and the read-back above catches it if it ever happens again.
4. A list screen still loading replaced its "new" button just after the agent found it, so the click was lost. A control
   is now used only when the same element is still in place a moment later.

### 8.2 Screens each scene needs (checked on GitHub `main`)

| Scene | Screen | State |
|---|---|---|
| Expenses, journals, statements, tax summary | Mizan journal, income statement, balance sheet, cash flow, tax | ✅ screens exist |
| Invoice, payment | Mizan sales invoices, receipts | ✅ screens exist (skill to write) |
| Sales order, S&OP, requisitions → PO | Mizan server has them; **no web screens on GitHub** (maybe on the owner's PC) | 🔨 or 🟡 — check after the push |
| Production, scrap, stoppages, quality, boards | GMES EXE, RPT4020, OEE2010, QMS, DSH5010 | ✅ screens exist (skills to write) |
| MRP / planning | GMES planning screens | 🟡 owner's PC |
| Shifts, schedule, staffing | HR screens | ✅ / 🟡 |
| Container 3D | Space Planner shipment page with load playback | ✅ |

### 8.3 On the projector

One large window shows the application the agent is working in (it brings that window to the front as it moves from
Mizan to GMES to HR to Space Planner); a narrow side window is the cockpit: the scene timeline, approval buttons and the
scoreboard. Optional 2×2 view: the four applications at once, each refreshing as the agent's work lands.

## 9. The film studio (owner's request, 2026-09-30)

A professional film of the agent at work, made from **real runs only**: the footage is what the browser painted while
the agent worked; the editor frames it and adds motion design around it, never redraws it.

| Step | File | What it does |
|---|---|---|
| Shoot | `agent/studio/record.mjs`, `shoot-journal.mjs` | Films a run (JPEG frames at 1.5× pixel density, each with its time) and logs every visible move of the agent: point, click, type, say, balanced, proven, done |
| Edit | `agent/studio/composer.html` | The film as a pure function of time: intro, scene card, the app in a window with a **camera that follows the agent** (springs aimed at each control it works on), live clock and step checklist, the agent's sentences as lower thirds, "balanced" badge and "proven" stamp on the real moments, a full-speed comparison with a stopwatch, figures, the next scenes, progress bar |
| Sound | `agent/studio/audio.mjs` | Synthesised, no licence: pad and arpeggio, a click on every real click, key ticks while it types, whooshes on transitions, a pop when the entry balances, a chime when it is proven; mastered to -1 dBFS |
| Render | `agent/studio/render.mjs` | Steps the composer frame by frame in a headless browser (1920×1080, 30 fps) and encodes H.264 + AAC MP4 with ffmpeg (`FFMPEG_PATH`); `--stills t1,t2` for design review; `--remux` for new sound on the same picture |

First film: the journal scene, 65 s, 1920×1080, 30 fps, sound at -23 dB mean. Every figure on screen comes from the run
(entry number, times, fields typed). Design review was done on stills before the render: right-to-left order of cards
and chains, one digit style for counters, the stamp's wording, the scene number.

## 10. Film 2: from the tile line to the container (2026-09-30)

`agent/studio/shoot-floor-to-container.mjs` starts its own GMES and Space Planner, sets up the tile line
(`sets/gmes-tile-line.mjs`), films two takes, and `render.mjs --cut cuts/floor-to-container.json` makes the film
(118 s, 1920×1080, 30 fps, -23 dB mean). The general editor `composer-scenes.html` takes any cut: scenes between the
agent's own marks, steps, badges (tones), stamps, figures, ending, and gives the sound its moments (`cues()`). A cut
lists `checks` against each take's result: the renderer refuses a film whose figures the run did not produce.

| Scene | What the agent does, in the real screens | Proven through the API |
|---|---|---|
| 02 Production | GMES in Arabic; operator station at the kiln: stop "kiln temperature", resume; sorting station: Good ×N 650 + 650 m² in lot S07-C2 | stoppage opened and closed; work order 1,300 good |
| 03 Quality | scrap by reason with a quantity: kiln crack 40, lamination 20, downgraded 80; scrap report; daily report (OEE 74.9 %) | work order 1,300 + 140 = 1,440, completed |
| 04 Container | Space Planner shipment: 23 pallets 1,100 × 1,100 × 1,000 mm, 1,305 kg each, 40′ HC → 2 containers; 3D stuffing | 20 pallets (26.1 t) + 3 (3,915 kg), both balanced |

The scenes found **five real product gaps**, all fixed in their own repositories with tests and planted bugs:

| Repository | Gap | Fix |
|---|---|---|
| GMES | Operator station went unit by unit for a lot item on a routing | serial mode only for serialised items (the server's rule) |
| GMES | "Good ×N" could not take the lot; scrap one piece per press; no ceramic reasons | lot prompt, scrap quantity, ceramic reasons (area `CER`) |
| GMES | Daily report showed the raw key `st.completed` | the name in both languages; test over the server's status list |
| Space Planner | Shipments ignored the payload (23 pallets = 30 t in one 40′ HC) | payload caps every container; kg per piece in the dialog |
| Space Planner | Weight-limited loads piled at the front wall (centre of mass 27 % off, rule 10 %) | spread in the fewest layers, centred; both containers pass balance |

Still open, for the product plan (not needed for the film): GMES holds work on units only (a shade lot of tiles cannot
be held: `hold.nothing`); second grade is a scrap reason, not a co-product in stock; Space Planner's shipment page
still says "loaded wall by wall from the front wall to the doors" for spread loads.
