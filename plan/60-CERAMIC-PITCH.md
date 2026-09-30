# 60 — Ceramic pitch: demo, deck and pilot proposal

Version 1.0 · 2026-09-30 · Owner's request: present to the board of a ceramic-tile factory (Beni Suef area) that the
team is a software, automation and AI-agents partner. Three deliverables, one plan.

| # | Deliverable | Form | Language |
|---|---|---|---|
| D1 | **Ceramic demo company** — the whole chain, small data, built from one command through the real apps | `scenario/ceramic/run.mjs` + `Start-Ceramic-Demo.bat` | App screens EN/AR as each app offers; codes in English |
| D2 | **Board deck** (12–14 slides) | Slides artifact (exports to PowerPoint / PDF) | Arabic |
| D3 | **Pilot proposal** (one page) | Document artifact (exports to Word / PDF) | Arabic |

## 0. Ground rules for this pitch (non-negotiable)

1. **No Samsung.** Nothing from `opening-nerp-tcode` (screens, names, data, the fact that it exists) appears in the demo,
   the deck or the proposal. No customer is named that has not agreed to be named.
2. **No invented results.** The deck shows what the software does, never "we saved X %" for a customer we do not have.
   Industry figures are labelled as ranges to be measured at the pilot.
3. **Invented company only.** Demo company: **"Demo Ceramics Co." / «شركة السيراميك التجريبية»**, code `DCER`. No real
   factory name, logo or product in any repository (all repositories are public). The prospect's name appears only in
   the deck and proposal, which are private artifacts, not files in git.
4. **Honest AI claims.** Say exactly what is AI and what is rules:
   | Feature | What it really is |
   |---|---|
   | Space Planner agent (describe a layout in words, the agent lays it out live, every change recorded with its name) | A real AI agent (Claude Code / Codex over MCP) — needs the agent CLI signed in on the demo laptop |
   | Mizan advisor (daily findings with the rule behind each) | Rule-based checks, "an automatic reviewer", not AI |
   | GMES refusals (unreleased lot cannot be loaded, unqualified person cannot work a station) | Rules enforced at the point of work |
   | How we build (five products, thousands of tests, built by a two-person team with AI agents) | True, and the strongest "agents raise productivity" proof we have |
5. Repository rules still apply: PowerShell-only tooling, no new dependencies, nothing in another app's database,
   every number through the real APIs.

## 1. The demo story (D1) — "one tile order, end to end"

Small data by design: 1 customer, 3 suppliers, 5 materials, 1 finished product (+ a second grade), 1 line,
1 work order, 1 shade lot. Builds in about a minute. Every step is checked (`must`) and the cross-system verifier runs
at the end.

| Act | What happens | System | Why the board cares |
|---|---|---|---|
| 1 | Master data: tile **60×60 glazed porcelain, white (m²)**, second grade, clay, feldspar, glaze (kg), cartons | Mizan → GMES mirror | One truth for items; no retyping |
| 2 | Plant model: line **L1** with the real ceramic steps — press, dryer, glazing, **kiln**, sorting & packing; shifts A/B; routing + BOM per m² | GMES | The factory as it really is |
| 3 | S&OP month plan + a **distributor order of 1,440 m²** (1,000 boxes of 1.44 m²) | Mizan → GMES | Demand drives everything |
| 4 | MRP computes clay, feldspar, glaze and cartons for the order → requisitions → **one purchase order** | GMES → Mizan | No Excel planning; nothing forgotten |
| 5 | Goods received with lots; **incoming inspection**: clay accepted, **a glaze lot partly rejected (wrong shade)** → rejected kilos go to **QA-HOLD** in Mizan; a rejected lot **cannot be loaded** on the glazing line | Mizan ↔ GMES | Stop a shade problem before the kiln, not at the customer |
| 6 | Production: work order released, materials consumed by lot, **kiln stoppage 45 min (temperature)** recorded, output **reported as one shade/caliber lot `S07-C2`**, losses by reason: kiln cracks, press lamination, downgrade to second grade | GMES | Yield, losses and OEE per reason, the same day |
| 7 | Close the work order → **Mizan values the production through WIP** (materials in = finished goods out) | GMES → Mizan | Real cost per m² without a spreadsheet |
| 8 | Deliver **one shade lot only** to the distributor, invoice, customer pays | Mizan | No mixed shades at the customer; cash closes the loop |
| 9 | Crew requirement of the line reaches HR as a **staffing gap** | GMES → HR | People planned from the production plan |
| 10 | Verifier: quantities, values and lots reconcile across the apps; Mizan advisor lists what needs attention | all | "Every number agrees" |

Numbers (exact, hand-checkable — the run asserts them):

| Quantity | Value |
|---|---|
| Order | 1,440 m² (requested in 21 days) |
| BOM per m² | clay 18 kg, feldspar 4 kg, glaze 0.8 kg, carton 0.7 pcs (1 carton = 1.44 m² → 0.694…; use **0.7** and state it) |
| MRP need for the order | clay 25,920 kg · feldspar 5,760 kg · glaze 1,152 kg · cartons 1,008 |
| Glaze lot inspection | 1,152 kg received → 1,000 kg accepted, 152 kg rejected (shade) → QA-HOLD |
| Production | good first grade **1,300 m²** in lot `S07-C2`; scrap: kiln crack 40, lamination 20, downgrade 80 (= 1,440 started) |
| Delivery | 1,300 m² of `S07-C2` to the distributor (order partly delivered: 1,300 / 1,440) |

Known simplification, said out loud in the demo: second grade is recorded as a loss reason (`DOWNGRADE`), not yet as a
co-product in stock. Co-products are a product gap to close after the pilot, not in this pitch.

### 1.1 Build steps (D1)

| Step | Work | Where | Done when |
|---|---|---|---|
| D1.1 | `scenario/ceramic/run.mjs`: the chain above on the same client/pump/must helpers as `scenario/chain/run.mjs`, reusing `pair()` and `verify()` | complete-company | runs green against fresh apps |
| D1.2 | Batch path in GMES: `work-orders/:id/consume`, `/complete` (with `lotNo`), `/scrap` (reason codes), `stoppages` (reason `KILN-TEMP`) — all exist; no GMES change planned. If a gap is found: stop, record it, work around in the scenario only | GMES (read only) | the run passes without touching GMES |
| D1.3 | Delivery from Mizan (`/sales/deliveries/deliver-line` with the lot) instead of GMES containers (GMES shipping is serial/pallet based) | complete-company | order shows 1,300 delivered |
| D1.4 | `Start-IntegratedDemo.ps1 -Scenario ceramic` (company name/code, own data folder `..\_ceramic-demo`, same ports) + `Start-Ceramic-Demo.bat` | complete-company | one double-click on Windows |
| D1.5 | `scripts/test.ps1` checks the new launcher exists; README row | complete-company | test green |
| D1.6 | `scenario/ceramic/STORYBOARD.md`: the 10 acts as a click-by-click script (which app, which screen, what to say, 10 minutes) | complete-company | rehearsal possible from the page alone |
| D1.7 | Space Planner: a ceramic plant layout (press → dryer → glazing → 100 m kiln → sorting → warehouse) built through its own API as a fallback, plus the live "describe it and the agent draws it" moment | 3D-Modeling (no code change) | layout opens; agent prompt text in the storyboard |

Verification: run the whole build on a clean data folder (Linux here, same Node scripts; the `.ps1` launcher is
reviewed line by line against the existing one because PowerShell is not available in this container), then read every
`ok` line. Owner rehearses once on Windows before the meeting.

## 2. The deck (D2) — 12–14 slides, Arabic

| # | Slide | Content |
|---|---|---|
| 1 | Title | Team name (placeholder), "partner for digital transformation, automation and AI agents in manufacturing" |
| 2 | Your day today | Ceramic pains in the board's language: sorting grades and losses, shade/caliber mixing, kiln energy and stops, daily reports by hand, stock by shade |
| 3 | What that costs | Where money leaks (losses per step, second grade, energy per m², late orders) — as questions to measure, no invented numbers |
| 4 | Our approach | Measure → connect → automate → agents; one owner per truth; each system works alone |
| 5 | What already exists | Four connected products (accounting/ERP, manufacturing, HR, 3D layout) — one picture |
| 6 | Live demo (1/2) | Order → planning → purchasing → inspection stops a wrong-shade glaze |
| 7 | Live demo (2/2) | Production by shade lot, losses by reason, kiln stop, cost through WIP, delivery by one shade, cash |
| 8 | Where AI agents fit | Real today: layout agent, automatic reviewer, rules at the point of work. Next: morning production brief, shade-lot assistant for sales, maintenance watch on kiln stops — each with a human who approves |
| 9 | How we work | Small team using AI agents: thousands of automated tests, every change recorded, nothing deleted, data stays in the factory (no cloud required) |
| 10 | Safety and ownership | Data on your server, backups, permissions, audit trail, Arabic + English |
| 11 | The pilot | One problem, 6–8 weeks, measured before/after (from D3) |
| 12 | Roadmap after the pilot | Phases: reports → production tracking → planning → integration with accounting → agents |
| 13 | Next step | One decision: approve the pilot and name a pilot owner |

## 3. The pilot proposal (D3) — one page, Arabic

Sections: the problem (to be confirmed in a 1-day visit) · the proposed pilot (default: **"daily production, sorting and
losses report by shade lot, ready every morning"**) · what the factory gives (a pilot owner, access to current reports,
one line) · what we deliver per week · how success is measured (time to produce the report, accuracy vs manual, losses
visible by reason) · duration 6–8 weeks · price: left as a placeholder for the owner and his partner · after the pilot.

## 4. Order of work

1. This plan (committed).
2. D1 in code: run.mjs → test locally until green → launcher → storyboard → commit and push to the session branch.
3. D2 deck and D3 proposal as private artifacts (not in git), links to the owner.
4. Report: what works, what to rehearse, what the owner must fill in (team name, partner's name, price, meeting date).

## 5. Risks

| Risk | Handling |
|---|---|
| A GMES batch path behaves differently than read | Found during D1.1 locally; adjust the scenario, never the app, and say so |
| No internet / no agent CLI at the meeting | The layout is prebuilt (D1.7); the agent moment is optional |
| Board asks "which factories use it?" | Honest answer: new products, built on proven patterns; that is why we propose a pilot, not a big contract |
| Board asks about SAP / Oracle | We connect and complement; a pilot does not replace anything |
| Laptop demo fails live | Rehearse; keep screenshots of each act in the deck as backup |

## 6. Status (2026-09-30)

| Step | State | Proof |
|---|---|---|
| D1.1 `scenario/ceramic/run.mjs` | Written | `node --check` |
| D1.2 batch path in GMES | **Proven** on GitHub `main` (901c296), GMES alone: 5-step routing, BOM per m² with decimals, work order 1,440 m², consume by lot with station, kiln stoppage, completion 1,300 m² as lot `S07-C2`, scrap 40/20/80 by reason, close; scrap report shows 9.7 % by reason | test harness run, all ok |
| D1.3 delivery of one shade lot | **Proven** on GitHub `main` (83d9d14), Mizan alone: two shade lots in stock, delivery names `S07-C2`, order 1,300/1,440 partially delivered, invoice from the delivery posted, payment posted; advisor returns findings | same run |
| D1.4 launcher | `Start-IntegratedDemo.ps1 -Scenario ceramic`, `Start-Ceramic-Demo.bat`; refuses to show one demo company while the other runs on the same ports | reviewed; PowerShell not available in the container |
| D1.5 checks | `scripts/test.ps1` checks both launchers and both chains | — |
| D1.6 storyboard | `scenario/ceramic/STORYBOARD.md` | — |
| D1.7 Space Planner layout | Live agent moment in the storyboard (optional); prebuilt layout not done | — |
| **Whole chain end to end** | **Not yet run.** The chain needs work that is on the owner's PC and not on GitHub: GMES planning (`/api/pln/*`), incoming-lot inspection (`/api/qms/incoming-lots`), peers and push (`/api/eco/peers`, `/api/eco/push`), shipping from sales orders; Mizan `/api/mfg/gmes-wip`; HR `/api/staffing/gap`. The TV chain (`scenario/chain`) needs the same work, so it cannot run from GitHub either. | pairing stopped at `GET /api/eco/peers: 404` on GitHub `main` |

**Owner action before the meeting:** push the local work of GMES, Mizan and HR to GitHub (or run `Start-Ceramic-Demo.bat`
on the PC that has it) and send the output of the first build. Every step prints `ok` or `FAIL` with the two numbers that
disagree, so one run tells what to fix.
