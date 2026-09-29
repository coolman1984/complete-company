# Complete Company — Master Plan

Version 1.0 · 2026-09-29 · Planner: Claude Opus 5.5 · Implementers: Sonnet 5.5 agents (effort high)

This plan turns four separate applications into **one package for a small or mid-sized factory**, proven by one
end-to-end TV-plant simulation that an industry expert cannot fault. It is written for the agents who will build
it: every work package says **what** to build, **where**, **how**, **in which order**, and **how to prove it is done**.

| File | Read it when |
|---|---|
| `00-MASTER-PLAN.md` (this file) | Always, first |
| `01-CONTRACTS-AND-FLOWS.md` | Any work that sends or receives data between applications |
| `10-MIZAN.md` | Work in `Accounting-sys` |
| `20-GMES.md` | Work in `GMES` |
| `30-HR.md` | Work in `hr-system` |
| `40-SPACE-PLANNER.md` | Work in `3D-Modeling` |
| `50-PACKAGE-AND-SCENARIO.md` | Work in `complete-company` (launcher, portal, pairing, scenario engine, verifier) |
| `../scenario/book.json`, `../scenario/STORYBOARD.md` | Any seed, scenario or verifier work |
| `../research/TV_INDUSTRY_REFERENCE.md` | Any number, rule or process step you are unsure about |

---

## 1. The product

| Application | Repository (GitHub `coolman1984/…`) | Stack | Owns | Port real / demo |
|---|---|---|---|---|
| **Mizan** (ERP + accounting) | `Accounting-sys` | Node 22, TypeScript, Fastify 5, node:sqlite, React, zod 4.6.5 | Company, customers, suppliers, items, warehouses, stock value, sales orders, S&OP demand plan, purchasing, money, banks, tax, fixed assets, financial reports | 4800 / 4810 |
| **GMES** (MES + planning) | `GMES` | Node 22, TypeScript, Fastify 5, node:sqlite, no-build JS screens, zod 4.6.5 | Plant model, engineering (routings, BOMs), production plan (MPS), MRP, work orders, production facts, serials, quality, OEE, packing, shipping | 4700 / 4701 |
| **HR-System** | `HR-System` (local folder `hr-system`) | Python 3.10+ standard library only, SQLite, eco-ui kit copy | People, organisation, positions, headcount plan, recruitment, shifts and schedule, attendance, leave, overtime, skills, training, discipline, payroll calculation | 8766 / 8790 |
| **Space Planner** | `3D-Modeling` | pnpm, TypeScript 7, React 19, three.js, node:sqlite, loopback-only server | Spatial layout of halls, lines, warehouses; placement of stations; storage locations | 4600 |
| **Package** | `complete-company` | PowerShell + Node (no dependencies) | Launcher, portal, pairing wizard, scenario engine, cross-system verifier, this plan | portal 4500 |

The five repositories are cloned side by side in one folder (`…\GitHub\Complete Company\`).

### 1.1 What "done" looks like for the whole program

1. A customer can install the four applications from one launcher, pair them in one wizard, and use each one alone
   or all together.
2. A sales order entered in Mizan drives, without retyping anything, S&OP → MPS/MRP in GMES → purchase requisitions
   and purchase orders in Mizan → material receipt and incoming inspection → production with serials and quality in
   GMES → crew requirements to HR → hiring, training, shifts and overtime in HR → packing and dispatch in GMES →
   delivery, invoice, e-invoice, collection and bank in Mizan → payroll from HR booked in Mizan → KPIs everywhere.
3. The **Nile Vision Electronics** scenario (`scenario/book.json`) builds all four demo databases from one command
   through the real APIs and the real event links, and `verify` proves every reconciliation in `book.json#checks`.
4. Every repository's own definition of done is green on `main`.

---

## 2. Architecture

### 2.1 Principles (fixed — never relax them)

1. **One owner per truth.** Each entity has exactly one owner application. Others keep read-only mirrors.
2. **No shared database, no cross-database reads.** Integration is `@eco/contracts` events over HTTP only.
3. **Facts, not commands.** An event says what happened or what an owner concluded; the receiver decides what to do.
4. **Each application runs fully alone.** Integration is an add-on that can be switched off per link.
5. **No silent failure.** An event that cannot be applied is *parked*, acknowledged with a code, and visible in the
   exceptions screen of both sides.
6. **No money in manufacturing, no people data outside HR, no geometry outside Space Planner.**
7. **Quantities are exact decimals on the wire** (strings, ×1000 inside); refuse anything that would round.
8. **Versions only go up.** Snapshots carry a monotonic `version`; consumers apply only newer versions.

### 2.2 The integration machinery (already designed and built in GMES; copy the pattern)

```
 Producer app                                          Consumer app
 ┌──────────────────────────────┐                      ┌──────────────────────────────┐
 │ business change ─┐ same tx   │                      │ POST /eco/v1/inbox           │
 │                  ▼           │  pull (cursor)       │   dedupe (source, id)        │
 │ eco_outbox (append-only,     │ ◄─────────────────── │   apply in one tx per event  │
 │   gap-free seq)              │  GET /eco/v1/feed    │   result: applied|unchanged| │
 │ GET /eco/v1/feed?after=&limit│ ───────────────────► │   stale|duplicate|rejected   │
 │ POST /eco/v1/acks            │ ◄── acks ──────────  │ link state: cursor + applied │
 └──────────────────────────────┘                      └──────────────────────────────┘
          or: producer PUSHES its outbox to the consumer's POST /eco/v1/inbox (HR → GMES does this)
```

- **Envelope:** CloudEvents 1.0 (`eco.envelope.v1`): `specversion, id, source "eco://<company>/<app>/<node>", type,
  subject, time, datacontenttype, ecoseq, ecocorrelation, ecocausation?, data`.
- **Auth:** header `x-eco-key`, scoped machine keys stored as SHA-256 hashes, printed once. Scopes:
  `eco.feed.read`, `eco.inbox.write`, `eco.acks.write`, `eco.events.read`. Human sessions never use eco routes.
- **Identity:** `company_id` = UUIDv7 created once by Mizan at setup and copied to the others at pairing.
  Global ids: Mizan `UUIDv5(company, "mizan:<type>:<local id>")`; HR `UUIDv5(company, "hr:<type>:<code>")`;
  GMES UUIDv7 minted at creation. A code change never changes an id.
- **Contracts:** defined once in `GMES/packages/eco-contracts/src` (zod) → generated JSON Schemas in
  `GMES/packages/eco-contracts/schemas`. Mizan vendors a byte-identical copy of `src/` with a SHA-256 pin test;
  HR copies `schemas/` byte-identical into `eco_schemas/` and validates with its stdlib validator; Space Planner
  vendors only what it uses, same pin rule. **A contract changes in GMES first, then is re-copied.**

### 2.3 Technology decisions (decided; an implementer must not reopen them)

| Concern | Decision | Rejected |
|---|---|---|
| Transport | HTTP/1.1 + JSON, CloudEvents envelope | Kafka, RabbitMQ, NATS, MQTT, gRPC |
| Delivery | Outbox in writer's transaction + cursor pull or push-to-inbox + acks + dedupe | Webhooks without outbox; shared tables |
| Contracts | zod → JSON Schema, one source in GMES | Per-app hand-written types; protobuf |
| Storage | Each app its own SQLite (WAL) | Central DB, data warehouse |
| Machine auth now | Scoped API keys (`x-eco-key`) | Reusing human logins (link-mizan today — to be replaced) |
| Machine auth later (P7) | Pinned TLS 1.3 + Ed25519 device identity + per-request HMAC (BAMS pattern) | Plain HTTP on a LAN |
| Secrets on Windows | DPAPI (`CryptProtectData`) | Plain config files |
| Live views | SSE | WebSockets, UI polling |
| Human sign-in | Per application (no SSO in this program) | Shared cookies |
| Tooling | PowerShell `.ps1` + `.bat` launchers only | bash, `.sh` |
| New npm/pip dependencies | **Not allowed** without the owner's written approval | — |
| Planning engine location | MPS/MRP/RCCP/crew calculation in **GMES** (owns BOM, routing, capacity; quantities only) | MRP in Mizan (would need a second BOM truth) |
| Demand / S&OP location | Demand plan + consensus in **Mizan** (owns customers, prices, revenue) | S&OP in GMES (no money allowed there) |

### 2.4 Ownership map (extends `GMES/docs/ecosystem/02-truth-ownership.md`; the new rows are this program)

| Entity | Owner | Mirrors | Contract |
|---|---|---|---|
| Company identity | Mizan | all | pairing (config) |
| Party (customer, supplier) | Mizan | GMES | `eco.party.v1` **new** |
| Item, UoM | Mizan (engineering facets: GMES) | GMES | `eco.item.v1` |
| Item planning parameters (lead time, MOQ, lot size, safety stock) | Mizan | GMES (inside item mirror extension or own mirror) | extend `eco.item.v1` additively — see 01 §2 |
| Warehouse | Mizan | GMES | `eco.warehouse.v1` |
| Stock balance (on hand, reserved) | Mizan | GMES | `acc.stock_position.v1` **new** |
| Sales order | Mizan | GMES | `acc.sales_order.v1` **new** |
| Demand plan (S&OP consensus) | Mizan | GMES | `acc.demand_plan.v1` **new** |
| Purchase order | Mizan | GMES | `acc.purchase_order.v1` **new** |
| Goods receipt (lots received) | Mizan | GMES (to inspect) | `acc.goods_receipt.v1` **to add** |
| Routing, BOM (engineering) | GMES | Mizan (costing roll-up, optional) | `mes.bom.v1` **to add (optional, P3)** |
| Production plan / MPS / MRP run | GMES | Mizan (supply review) | `mes.supply_plan.v1` **new** |
| Purchase requisition | GMES (the need) | Mizan (converts to PO) | `mes.purchase_requisition.v1` **new** |
| Crew requirement | GMES (the need) | HR (staffs it) | `mes.crew_requirement.v1` **new** |
| Work order, production facts | GMES | Mizan (value) | `mes.material.consumed.v1`, `mes.production.completed.v1`, `mes.production.scrapped.v1`, `mes.work_order.closed.v1` |
| Incoming-lot quality decision | GMES | Mizan (stock status, supplier claim) | `mes.lot_decision.v1` **to add** |
| Shipment | GMES | Mizan (delivery, invoice) | `mes.shipment.dispatched.v1` (extended with SO line) |
| Labour booked at stations | GMES | HR (hours, overtime evidence) | `mes.labor_day.v1` **to add** |
| Employee, org, schedule, attendance, qualification | HR | GMES | existing `eco.*` |
| Payroll period totals | HR | Mizan (journal) | `hr.payroll_period.v1` **to add** |
| Plant nodes (lines, stations) for layout | GMES | Space Planner | `eco.plant_node.v1` **to add** |
| Layout snapshot, storage locations | Space Planner | GMES | `eco.layout.snapshot.v1` **to add** |

### 2.5 The end-to-end business process (the spine every work package serves)

| # | Step | System | Document / action | Event out |
|---|---|---|---|---|
| 1 | Monthly S&OP: demand review | Mizan | Demand plan version (item × month), revenue value | — |
| 2 | Supply review | GMES | MRP run on the draft demand → supply plan with constraints | `mes.supply_plan.v1` |
| 3 | Executive S&OP | Mizan | Demand vs supply vs budget; approve consensus | `acc.demand_plan.v1` |
| 4 | Customer order | Mizan | Sales order, credit check, reservation, ATP → promised date | `acc.sales_order.v1`, `acc.stock_position.v1` |
| 5 | MPS + MRP (nightly or on demand) | GMES | Planned orders (make), requisitions (buy), pegging, crew needs | `mes.purchase_requisition.v1`, `mes.crew_requirement.v1`, `mes.supply_plan.v1` |
| 6 | Purchasing | Mizan | Requisition → PO (USD, incoterm, LC optional) | `acc.purchase_order.v1` |
| 7 | Staffing | HR | Staffing gap → requisition → hire temps → training → qualification → shift assignment → overtime | `eco.employee.v1`, `eco.schedule_day.v1`, `eco.qualification.v1` |
| 8 | Import & receipt | Mizan | LC / T/T, landed cost (freight, duty, clearance), goods receipt with lots | `acc.goods_receipt.v1`, `acc.stock_position.v1` |
| 9 | Incoming inspection | GMES | IQC by AQL → accept / reject lot | `mes.lot_decision.v1` |
| 10 | Release & produce | GMES | Firm planned order → work order (frozen routing/BOM) → serial flow, backflush, repair, OEE | `mes.material.consumed.v1`, `mes.production.completed.v1`, `mes.production.scrapped.v1`, `mes.labor_day.v1` |
| 11 | Value production | Mizan | WIP in, finished goods at cost, variances at close | — |
| 12 | Pack & ship | GMES | Pallets, shipping order from SO lines, container, OQC, seal, dispatch | `mes.shipment.dispatched.v1`, `mes.work_order.closed.v1` |
| 13 | Deliver & bill | Mizan | Delivery (goods issue) per SO line → invoice → ETA e-invoice | `acc.sales_order.v1` (delivered qty) |
| 14 | Collect | Mizan | Transfer / PDC cheque → bank → reconciliation, FX difference | — |
| 15 | Pay people | HR → Mizan | Payroll period (attendance, overtime, night allowance) → one journal per cost centre | `hr.payroll_period.v1` |
| 16 | Close & measure | all | Month-end close, KPI pack (OTD/OTIF, forecast accuracy, OEE, FPY, turns, DSO/DIO/DPO, labour productivity, cost per set) | — |

---

## 3. Current state (verified 2026-09-29 by the planner)

| Repo | `main` on GitHub | Work in progress (NOT on main yet) | Action owner |
|---|---|---|---|
| `complete-company` | launcher, portal, review, research | `plan/` (this), `scenario/` (being written) | WP-P0 |
| `Accounting-sys` | b5a4b89 | branch `feat/sales-sop` in worktree `_worktrees\mizan-sales` (sales orders, ATP, deliveries, OTD/OTIF, S&OP) · branch `feat/purchasing-eco` in worktree `_worktrees\mizan-eco` (item planning fields, requisitions, USD PO, LC, native eco module) — both being built by agents | WP-M1, WP-M2 |
| `GMES` | 3c09b3d (B1–B4) | **uncommitted merge** of `7f96fe0` (station on ledger; conflicts resolved; 114 tests green; planted-bug run in progress) + **uncommitted** new contracts `packages/eco-contracts/src/plan.ts` (+ index/ids/mes edits, 21 schemas) + stash `admin-123` (demo login in `scripts/seed-demo.ts`) | WP-G0 |
| `hr-system` | 75ab88e — Phase A landed (in-product publisher `hr_core/eco_link.py`, Integration screen, DPAPI key store, `/api/admin/integration*`); full test list incl. planted bugs ALL GREEN on 2026-09-29 | only WP-H0 step 4 (re-copy the eco-ui kit) remains | WP-H0 step 4 |
| `3D-Modeling` | 0c7e07c | none | — |

Known facts an implementer must not rediscover the hard way:
- Mizan has **no** sales orders, deliveries, reservations, S&OP, requisitions, LC, PO currency, company id, API keys,
  outbox (being built in WP-M1/M2). Its invoice posting issues stock (`inventory/service.ts onDocumentPosted`).
- GMES has **no** planning (MPS/MRP), no demand intake, no due date or SO link on work orders, no goods-receipt
  intake, and link-mizan **skips** `mes.shipment.dispatched.v1`. Its demo seed uses none of B1–B4 features.
- HR has **no** headcount plan, vacancies, recruitment, overtime, training, leave module, payroll code; attendance is
  matched by an uploaded employee file, not yet bound to the registry. `tools/make_demo.py` creates a random company id.
- Space Planner has **no** company id, no users, no ecosystem code; server is loopback-only by design.

---

## 4. Phases, work packages and order

Effort: **S** ≤ 1 agent session · **M** 2–3 sessions · **L** 4+ sessions. One work package = one branch = one
agent at a time per repository folder (use a separate git worktree per parallel agent; see §6).

### 4.1 Phase map

| Phase | Goal | Work packages (file) | Gate to leave the phase |
|---|---|---|---|
| **P0 Stabilise** | Everything in progress lands on `main` | WP-G0, WP-H0 (20, 30) · WP-P0 (50) | All repos green on `main`; `_worktrees` of finished branches removed |
| **P1 Contracts v2** | Every contract of 01 exists in GMES, schemas generated, copies refreshed in Mizan and HR | WP-C1 (01) | Contracts tests green in GMES; pin tests green in Mizan and HR |
| **P2 ERP depth** | Mizan covers sales, S&OP, purchasing, trade finance, eco | WP-M1, WP-M2 (in progress), WP-M3, WP-M4, WP-M5 (10) | Mizan green; eco feed/inbox proven against GMES in an e2e test |
| **P3 Planning & execution links** | GMES plans (MPS/MRP/RCCP/crew), receives, ships against sales orders | WP-G1 … WP-G7 (20) | GMES green incl. e2e with real Mizan + HR checkouts |
| **P4 Workforce** | HR staffs the plan: gap, recruitment, overtime, training, attendance bound, payroll | WP-H1 … WP-H6 (30) | HR green; payroll gate passed; `hr.payroll_period.v1` booked in Mizan e2e |
| **P5 Layout** | Space Planner linked to GMES stations; snapshot and live view | WP-S1 … WP-S3 (40) | 3D `pnpm check` green; GMES imports the snapshot |
| **P6 Package & scenario** | Pairing, portal, scenario engine, verifier, presentation | WP-P1 … WP-P5 (50) | `scenario build` + `scenario verify` green from a clean clone |
| **P7 Security & operations** | TLS, device identity, DPAPI everywhere, backups, health | WP-X1 … WP-X3 (50 §7) | Security tests green; LAN install rehearsal passed |
| **P8 Docs & release** (end of each phase) | Each repo's docs updated once per phase, not per task | WP-D (every file, "phase-end docs") | Docs checks green; release notes |

### 4.2 Dependency graph (build in this order; items on one line can run in parallel)

```
P0:  WP-G0 ─┬─ WP-H0 ─┬─ WP-P0
            │         │
P1:  WP-C1 (contracts v2 in GMES) ──► refresh copies in Mizan (M2 pin) and HR (eco_schemas)
            │
P2:  WP-M1 (sales/S&OP) ∥ WP-M2 (purchasing/eco) ──► WP-M3 (Mizan integration wiring) ──► WP-M4 (native production posting) ∥ WP-M5 (payroll posting)
            │
P3:  WP-G1 (acc.* mirrors) ──► WP-G2 (planning engine) ──► WP-G3 (WO/SO links) ∥ WP-G4 (receiving + IQC decision)
                                          │                 └─► WP-G5 (ship vs SO, OTD) ──► WP-G6 (labour facts) ∥ WP-G7 (link-mizan autostart/retire)
P4:  WP-H1 (staffing gap from crew req) ──► WP-H2 (headcount plan + recruitment) ∥ WP-H3 (overtime) ∥ WP-H4 (training)
                                          ──► WP-H5 (attendance bound + leave) ──► WP-H6 (payroll + hr.payroll_period.v1)
P5:  WP-S1 (plant link + eco.ref) ──► WP-S2 (snapshot export/import) ──► WP-S3 (live view; needs WP-G8 SSE)
P6:  WP-P1 (pairing) ∥ WP-P2 (portal integration view) ──► WP-P3 (scenario engine) ──► WP-P4 (verifier) ──► WP-P5 (presentation)
P7:  WP-X1 (DPAPI + keys) ──► WP-X2 (pinned TLS) ∥ WP-X3 (backups/health across apps)
```

**Critical path to the demo:** WP-G0 → WP-C1 → WP-M1/M2 → WP-M3 → WP-G1 → WP-G2 → WP-G4/G5 → WP-H1 → WP-H2/H3 →
WP-P3 → WP-P4. P5 (layout), WP-H6 (payroll) and P7 can follow the first demo without blocking it; the scenario
engine books payroll through Mizan's existing payroll module until WP-H6 lands (see 50 §4.6).

### 4.3 Suggested calendar (agent sessions; parallel lanes per repository)

| Week | Lane Mizan | Lane GMES | Lane HR | Lane Package / 3D |
|---|---|---|---|---|
| 1 | M1, M2 finish + merge | G0, C1 | H0 | P0, scenario book review |
| 2 | M3 | G1, G2 (engine) | H1 | P1 pairing |
| 3 | M3 finish, M4 | G2 finish, G3, G4 | H2, H3 | S1 |
| 4 | M5 | G5, G6, G7 | H4, H5 | P3 scenario engine |
| 5 | fixes from scenario | G8 SSE, fixes | H6 payroll | P3, P4 verifier, S2 |
| 6 | phase-end docs | phase-end docs | phase-end docs | P5 presentation, S3, X1 |
| 7+ | P7 security, LAN rehearsal | | | |

---

## 5. Global definition of done (every work package)

1. The repository's own definition of done passes (see its CLAUDE.md):
   - Mizan: `npm run typecheck`, `npm test`, `npm run docs:map`.
   - GMES: `pwsh -File scripts/test.ps1` (typecheck, all tests with pinned real Mizan + HR, planted bugs).
   - HR: every command in CLAUDE.md "Tests", including `TEST_DOCS_CURRENT.py` and `python migration/mutations.py`.
   - Space Planner: `pnpm check`.
   - Package: `pwsh -File scripts/test.ps1`.
2. **New business rule → new test → new planted bug** (GMES `scripts/mutations.mjs`, HR `migration/mutations.py`)
   that the test catches.
3. Both languages (EN + AR) for every user-visible text, in the app's dictionaries.
4. No new dependency. No money in GMES. No personal data leaving HR. No direct DB access across apps.
5. Test-enforced docs are updated in the same commit (Mizan `docs/MAP.md`, HR `STATUS.md` inventory,
   GMES schemas). **Hand-written docs (HISTORY, LESSONS, ADRs, CHANGELOG, ARCHITECTURE, ecosystem docs, handoff)
   are written ONCE at the end of each phase (WP-D)**, from the notes the agents leave in their reports —
   owner's instruction 2026-09-29.
6. Commit on the work package branch; when green, merge to `main` and push (owner authorised merging and pushing
   green work to `main`). Delete the branch and its worktree after merge.

---

## 6. Rules for implementing agents (learned the hard way — read all)

1. **PowerShell only.** Never bash, never `.sh`. Quote paths: the root contains spaces
   (`D:\WORK\Software Development\GitHub\Complete Company`). `Start-Process -ArgumentList` does **not** quote array
   items — pass one pre-quoted string. `cmd /c "<quoted path>" args` is mangled — run launchers by name with
   `-WorkingDirectory`.
2. **Planted-bug runs mutate real files.** `GMES/scripts/mutations.mjs` and `hr-system/migration/mutations.py`
   write a bug into a source file, run tests, then restore it. **Never interrupt them, never run two at once, never
   edit a file they target while they run, never import `mutations.py` (it has no `__main__` guard — importing
   runs it).** After any crash, check for leftovers: for each entry `(file, from, to)`, the file must contain `from`
   and not `to` (see `complete-company/scripts/` helper `Find-LeftoverMutations` — WP-P0 adds it).
3. **Parallel agents = separate git worktrees.** Create them yourself under
   `…\Complete Company\_worktrees\<repo>-<wp>` with `git worktree add -b <branch> <path> main`, then run
   `npm ci --prefer-offline` inside (Mizan/GMES workspaces link packages by junction — a shared `node_modules`
   silently tests the wrong copy). Remove with `git worktree remove` after merge.
4. **Git is slow on this machine** (1.5 s per status in Mizan). Do not run `git fetch --all` across repos in one
   2-minute call; one repo per call.
5. **HR tests regenerate sample files** (`sample/*.xlsx`, sometimes `inputs/`): run `git checkout -- sample/` after
   the HR test list, before committing.
6. **Contracts change in GMES first** (`packages/eco-contracts/src`, then `npm run schemas -w packages/eco-contracts`),
   then re-copy to Mizan (`apps/server/src/eco-contracts/` + pin) and HR (`eco_schemas/` byte-identical). Additive
   changes keep the version; breaking changes need a new `vN` and both versions during the transition.
7. **No new npm or pip packages** without the owner. Mizan and GMES already have zod 4.6.5; HR is stdlib only.
8. **Never commit** `data/`, `data-demo/`, `.cache/`, databases, keys, or real personal data. Demo login is
   `admin / 123`, demo only; real installs keep the 8-character minimum.
9. **Money is integer minor units** (Mizan piastres ×100 per `moneyScale`), **quantities ×1000**, **rates in basis
   points**; on the wire quantities are decimal strings.
10. **Dates:** business dates `YYYY-MM-DD` (plant local, Africa/Cairo); timestamps UTC RFC 3339; a production day
    starts 07:00 local; an overnight shift belongs to the date it starts.
11. **Deterministic seeds:** a fixed seed per generator; the scenario book is the only source of master data codes.
12. Report at the end of every session: what was built (tables, routes, screens), tests run with their summary
    lines, commits, open issues, and **notes for phase-end docs** (discoveries, decisions with rejected
    alternatives). The planner/next agent turns those notes into HISTORY/ADR entries at phase end.

---

## 7. Starting a work package (copy this prompt; fill the brackets)

```
You implement work package [WP-ID] of the Complete Company master plan.
Read, in order: complete-company/plan/00-MASTER-PLAN.md (all), complete-company/plan/01-CONTRACTS-AND-FLOWS.md
(the flows your WP touches), complete-company/plan/[10|20|30|40|50]-*.md (your WP section and §0 conventions),
the repository's CLAUDE.md, and any file the WP names. Industry facts: complete-company/research/TV_INDUSTRY_REFERENCE.md.
Scenario data: complete-company/scenario/book.json.
Work in: [repo path or worktree path — create a worktree per §6.3 if another agent is active in the same repo].
Branch: [wp-id-short-name]. PowerShell only. No new dependencies. Hand-written docs only at phase end.
Definition of done: master plan §5 + the WP's tests and planted bugs. When green: merge to main, push, remove the
worktree. Finish with the report of §6.12 (built, tests with summary lines, commits, open issues, notes for
phase-end docs).
```

Session checklist for the implementer: (1) `git status` clean or explained; (2) no planted-bug leftovers (§6.2);
(3) pull `main`; (4) write tests first for engines and rules; (5) run the full definition of done before merging;
(6) never leave a mutation run, a server or a worktree behind.

## 8. Risks and how the plan handles them

| Risk | Handling |
|---|---|
| Two agents change the same repo | One WP per worktree; merge order in §4.2; shared files (locales, module index, edition.mjs, MAP.md) resolved by re-running generators |
| Contract drift between apps | Single source in GMES + pin tests in every copy |
| Scenario too slow (serial scanning ~500k calls) | Scenario engine runs apps in-process with injected HTTP (`app.http.inject`) and a controlled clock; routing for the simulation uses 6 scan points; build target < 20 min, cached artefact for demos |
| Expert finds an inconsistent number | `book.json#checks` + verifier reconciles quantities, values, headcount, cash across apps; KPIs land near `kpi_expected` |
| Mizan moving-average vs standard cost | Keep moving average for stock (Mizan rule); show standard cost + variances in the manufacturing report; the storyboard explains it |
| HR payroll gate not passed in time | Scenario books payroll via Mizan's existing payroll module until WP-H6; the verifier marks it "interim" |
| LAN security | P7 before any customer install beyond one PC |
