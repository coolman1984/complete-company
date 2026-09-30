# 20 — GMES (repo `GMES`) work packages

Read first: `GMES/CLAUDE.md`, `README.md`, `docs/ecosystem/02-truth-ownership.md`, `docs/adr/README.md`.

## 0. Conventions (apply to every WP)

- A module is an `AppModule` (`apps/mes-server/src/kernel/modules.ts`, same shape as Mizan — ADR-020): `id`,
  `migrations: {id, up}[]` (ids `NNN_name`, append only, never renumber a shipped one), permissions (scopes),
  `setup(ctx)` to `ctx.services.provide(...)`, `routes(kit, ctx)` with `kit.http` + `kit.require(req, scope)`,
  `health`. Register in `apps/mes-server/src/app.ts`. A module imports only `kernel/`, `contracts/`,
  `@eco/contracts` and its own folder (`test/boundaries.test.ts`).
- Facts are append-only and hash-chained (`kernel/chain.ts`); corrections are new facts. Commands are idempotent via
  `commandId`. Time comes from `ctx.clock` only (never `new Date()` in module code) — the scenario engine controls it.
- **No money anywhere in GMES** (a test enforces it). Quantities ×1000 internally, decimal strings on the wire.
- Screens: `apps/mes-web/screens/<code>.js` built with `views.js` builders and the `eco-ui` kit, texts in
  `apps/mes-web/i18n/en.json` + `ar.json` (a planted bug checks Arabic completeness), every screen parses as a module
  (parse test). Menu codes follow the existing scheme (MDM, EXE, TRK, QMS, SHP, OEE, RPT, LBL, SYS; new: **PLN**).
- Done = `pwsh -File scripts/test.ps1` (typecheck, all tests with pinned real Mizan + HR, planted bugs) + a new planted
  bug per new rule in `scripts/mutations.mjs` (`{name, file, from, to, suite}`).

---

## WP-G0 · Land the work in progress — size S (do first)

State on disk (2026-09-29): `main` checked out with an **uncommitted merge** of `origin/claude/brave-turing-5zgtg1`
(`7f96fe0`, conflicts resolved: migration renumbered `004_ledger_station` after B1's `003_routing_bom`, both HISTORY
sections kept, contracts table merged), plus **uncommitted** contract work (`packages/eco-contracts/src/plan.ts`, edits
in `index.ts`, `ids.ts`, `mes.ts`, 21 regenerated schemas) and a **stash** `admin-123` (`scripts/seed-demo.ts` demo
login admin/123).

1. Wait for / re-run `node scripts/mutations.mjs` on the merge **alone** (it was re-started after a crash). All caught →
   commit ONLY the staged merge (`git commit` without `-a`; the contract files are unstaged except `mes.ts`, whose merge
   hunk is staged — use `git add -p` if needed so the merge commit holds only merge content).
2. Commit the contracts (`plan.ts`, `index.ts`, `ids.ts`, `mes.ts` extension, schemas) as "Contracts v2: plan-to-produce
   and order-to-cash", run `npm test -w packages/eco-contracts`.
3. `git stash pop` (admin-123) → commit "Demo sign-in admin / 123".
4. `scripts/start.ps1`: when `data/config.json` has a `mizan` section `{url, user, passwordFile, wipAccount,
   varianceAccount}` start `apps/link-mizan` as a second process (window title "GMES link to Mizan"), stop it with the
   server; `GET /api/system/health` gains a `link_mizan` check (age of the last successful cycle from the link's state
   file). Planted bug: link never started although configured.
5. Full `scripts/test.ps1` → push `main`. Delete remote branch `claude/brave-turing-5zgtg1` only after the owner
   confirms (it is fully merged; ask).

## WP-C1 · Contracts v2 completion — size S

Add the "to add" contracts of `01-CONTRACTS-AND-FLOWS.md` §2.1 (`acc.goods_receipt.v1`, `mes.lot_decision.v1`,
`mes.labor_day.v1`, `hr.payroll_period.v1`, `eco.plant_node.v1`, `eco.layout.snapshot.v1`, the additive
`eco.item.v1.planning` block), register, `npm run schemas`, tests (one valid and two invalid samples per type), and a
test that no contract GMES **accepts** in its inbox contains a money field (list the accepted types; assert none of
their schemas has `amount`, `price`, `cost`, `currency` keys). Then hand over the new `src/` + `schemas/` to Mizan
(pin refresh) and HR (`eco_schemas/`).

## WP-G1 · Mirrors of the accounting side — size M

Extend `modules/mdm` (it already mirrors items/warehouses/workforce with owner and version checks):

| Contract | Table(s) | Notes |
|---|---|---|
| `eco.party.v1` | `mdm_party(id PK, code, name_en, name_ar, roles, country, active, version, origin, updated_at)` | owner must be `mizan` |
| `eco.item.v1.planning` | `mdm_item_planning(item_id PK, material_type, procurement, lead_time_days, moq, lot_rule, lot_size, safety_stock, default_supplier_id, version)` | when `itemOwner = gmes` the same table is edited by screen MDM1070 |
| `acc.sales_order.v1` | `mdm_sales_order(id PK, code, customer_id, order_date, status, priority, customer_reference, ship_to, version, origin)` + `mdm_sales_order_line(so_id, line_no, item_id, qty, uom, requested_date, promised_date, delivered_qty)` | lines replaced on newer version |
| `acc.demand_plan.v1` | `mdm_demand_plan(id PK, code, cycle, status, approved_at, version)` + `mdm_demand_plan_line(plan_id, item_id, period, qty)` | keep history |
| `acc.stock_position.v1` | `mdm_stock(item_id, warehouse_id, on_hand, reserved, as_of, version)` PK (item, warehouse) | |
| `acc.purchase_order.v1` | `mdm_purchase_order` + `mdm_purchase_order_line(… expected_date, received_qty, requisition_id)` | |
| `acc.goods_receipt.v1` | handled in WP-G4 | |

- Inbox accepts these types (`modules/eco/index.ts` accepted list) only when `ownership.item = 'mizan'` (reuse the
  `mdm.not_mirror` / `mdm.wrong_owner` logic). A snapshot referencing an unknown item/party is parked
  `mdm.unknown_item` / `mdm.unknown_party`; the inbox **retries parked events of the same correlation** when the
  referenced master arrives (new small mechanism: after applying a master snapshot, re-apply parked events whose
  `code` is `mdm.unknown_*` and whose data references it).
- Read routes: `GET /api/customers`, `/api/sales-orders?status=&customer=`, `/api/sales-orders/:id`,
  `/api/demand-plans`, `/api/stock?item=&warehouse=`, `/api/purchase-orders?open=1`. Screens MDM1080 (customers),
  PLN1020 (sales orders, read-only), PLN1030 (demand plans, read-only), PLN1040 (stock and open POs).
- Tests: version rules, owner rules, parked + auto-retry, line replacement. Planted bugs: older version applied;
  parked event never retried.

## WP-G2 · Planning engine: MPS, MRP, RCCP, crew — size L (the heart of the program)

New module **`pln`** (`apps/mes-server/src/modules/pln/`): `index.ts` (module, routes, commands), `engine.ts`
(**pure** planning function), `store.ts` (reads mirrors, writes results), `publish.ts` (outputs → outbox).

### Data (migrations `001_pln`)

```
pln_settings(key PK, value)            -- horizon_days=91, frozen_days=14, slushy_days=56, planning_warehouses=[...],
                                       -- nightly_at='02:00', forecast_consumption_fwd_days=30, default_make_lead_days=1
pln_line_shift(line_code, shift_code, valid_from, valid_to, PRIMARY KEY(line_code, shift_code, valid_from))
                                       -- which shifts a line runs; the planner adds C for a period ("add shift")
pln_run(id PK, code UNIQUE 'MRP-YYYYMMDD-HHMM', started_at, finished_at, today, horizon_to, status, trigger, stats JSON)
pln_mrp_record(run_id, item_id, bucket_date, gross, scheduled_receipts, projected_on_hand, net, planned_receipt,
               planned_release, PRIMARY KEY(run_id, item_id, bucket_date))      -- the classic time-phased record
pln_planned_order(id PK, run_id, item_id, qty, start_date, due_date, line_code, status 'planned'|'firmed'|'released'
               |'cancelled', work_order_id, pegging JSON, firmed_by, firmed_at)
pln_requisition(id PK /* stable, see below */, code, item_id, qty, need_date, order_by_date, warehouse_id, status
               'open'|'cancelled', run_id, version, pegging JSON)
pln_crew(id PK /* uuidv5(company, "gmes:crew:<line>:<shift>:<date>") */, line_code, shift_code, work_date,
         headcount, skills JSON, run_id, version)
pln_exception(run_id, kind, item_id, line_code, date, severity, message_key, data JSON)
```

Additive fields elsewhere (own migrations in their modules — through services, not cross-writes):
- `mdm_plant_node.crew INTEGER` (people a station needs per shift; line node = line overhead: leader, handler, repair).
- `eng_bom_line.scrap_bp INTEGER NOT NULL DEFAULT 0` (component scrap allowance, basis points).
- `mdm_item_planning.expedite_lead_time_days` (optional; air-freight alternative) — only when `itemOwner = gmes`;
  from Mizan it arrives in the item planning block (add it to the contract in WP-C1 as optional).

### The algorithm (`engine.ts`, pure: `plan(input: PlanInput): PlanOutput`; `input.today` is given, no clock inside)

1. **Calendar.** Working days from `eng_calendar` + rest weekdays + holidays; shift availability per line from
   `pln_line_shift` (default: every active `eng_shift` A and B for every line unless configured).
2. **Demand per finished item and day** (bucket = working day, horizon `today … today + horizon_days`):
   - Firm: open SO lines `qty − delivered_qty` on `promised_date ?? requested_date` (past-due → today, flagged).
   - Forecast: latest `approved` demand plan per item × month, spread evenly over the working days of the month
     that are ≥ today; **consumed** by firm orders of the same month (forecast left = max(forecast − firm, 0)).
   - Safety stock is a floor, not a demand (step 4).
3. **MPS (finished items, `procurement = make`).** Net against projected on-hand (step 4 rules); planned orders sized
   by the item's lot rule; due date = demand date; start date = due − make lead time (working days); line = the line
   whose approved routing makes the item (if several, the least loaded in that week); inside the **frozen fence**
   (today + frozen_days) the engine creates **no new** planned orders and changes no firmed ones — it raises
   exception `late_demand` instead.
4. **Netting (every item, low-level-code order):** POH(d) = POH(d−1) + scheduled receipts(d) + planned receipts(d) −
   gross(d); start POH = Σ `on_hand − reserved` over planning warehouses (`mdm_stock`); scheduled receipts = open PO
   lines (`qty − received_qty` on `expected_date`) + released work orders (`planned − completed − scrapped` on their
   due date); when POH(d) < safety stock → net requirement = safety − POH(d) → planned receipt on d, sized by lot
   rule: lot-for-lot = net; fixed = ceil(net / lot) × lot; multiple = ceil(net / lot) × lot; then max(MOQ, …).
5. **Explosion:** each planned order's **start** date creates gross requirements for its BOM components
   (approved `eng_bom` revision, `qty_per × (1 + scrap_bp/10000)`, exact decimals; refuse to round — carry ×1000).
   Low-level codes computed from BOM graph (cycle → exception `bom_cycle`, stop).
6. **Buy items** (`procurement = buy`): planned receipt → **requisition** with `need_date` = receipt date,
   `order_by_date` = need_date − lead_time_days (calendar days); `order_by < today` → exception `past_due_order`
   with the expedite alternative if `expedite_lead_time_days` exists (need_date − expedite ≥ today → "expedite
   possible").
   Requisition id is **stable**: `uuidv5(company, "gmes:pr:<item code>:<ISO year-week of need_date>")` — a later run
   updates the same requisition (new version) instead of creating a new one; a requisition not produced by the
   latest run is published `cancelled`.
7. **Make items below finished level** (e.g. main board PBA on SMT): planned orders on their routing's line, same
   rules; they feed RCCP.
8. **RCCP (rough-cut capacity):** load(line, day) = Σ planned + firmed + released qty due that day on the line ÷
   (capacity_per_shift × shifts available that day). > 100 % → try to **level** by moving planned (not firmed)
   orders earlier within the slack to days with room (never before today + frozen_days, never after due) → still
   > 100 % → exception `capacity_overload` with a proposal: "add shift C on line L from D1 to D2" (the smallest
   continuous window that removes the overload) — the planner accepts it with the command `add-line-shift`, which
   writes `pln_line_shift` and re-runs.
9. **Crew:** for every line × shift × working day in the horizon where the line runs and has load > 0:
   `headcount = line.crew + Σ station.crew` (stations of that line), `skills = Σ per station of
   mdm_station_requirement (skill, min level)` counted per station; days/shifts without load → headcount 0 if a
   previous version was > 0 (withdraw), else nothing.
10. **Pegging:** every planned receipt carries its demand sources (SO code/line, demand-plan code/period, safety) with
    quantities, propagated down the BOM proportionally. The requisition carries the pegging of its receipt.
11. **Supply plan:** per finished item × month: demand (firm + forecast left), planned completions, constraint
    (`capacity` if RCCP left overload on its line in that month, `material` if a component has `past_due_order`
    without expedite, `both`, `none`).
12. **Determinism:** same input → byte-identical output (sort by item code, date, line); no randomness.

### Commands and routes

| Route | Scope | What |
|---|---|---|
| `POST /api/pln/runs` | `pln.run` | run now (also the nightly job at `nightly_at` via the clock) → stores results, publishes outputs in one transaction |
| `GET /api/pln/runs`, `/runs/:id` | `pln.read` | runs and stats |
| `GET /api/pln/mps?from=&to=&item=` | `pln.read` | MPS grid |
| `GET /api/pln/mrp/:itemId?run=` | `pln.read` | time-phased record |
| `GET /api/pln/planned-orders?status=` / `POST /:id/firm` / `POST /:id/release` / `POST /:id/cancel` | `pln.plan` | firm → release creates a work order (existing exe service) with `due_date`, `planned_order_id`, pegging |
| `GET /api/pln/requisitions` | `pln.read` | with PO status from the `mdm_purchase_order` mirror (open / on PO / received) |
| `GET /api/pln/capacity?from=&to=` / `POST /api/pln/line-shifts` | `pln.read` / `pln.plan` | load per line × day; add/remove a line shift for a period |
| `GET /api/pln/crew?date=` | `pln.read` | required vs scheduled (from `mdm_schedule_day` + qualifications) per line × shift |
| `GET /api/pln/exceptions?run=` | `pln.read` | |
| `PUT /api/pln/settings` | `pln.admin` | |

Publishing after a run (same transaction as storing the run): changed requisitions, the supply plan, changed crew
requirements (`publish.ts` compares with the previous version; unchanged → no event).

### Screens (EN/AR, eco-ui)

PLN2010 MRP runs (run now, last run, stats, exceptions count) · PLN2020 MPS (item × day/week: demand firm/forecast,
planned, POH; frozen/slushy/liquid zones shaded) · PLN2030 MRP record (classic table per item) · PLN2040 Planned
orders (firm / release / cancel, pegging drawer) · PLN2050 Requisitions · PLN2060 Capacity (line × day heatmap, add
shift) · PLN2070 Crew coverage (required, scheduled, qualified, gap) · PLN2080 Exceptions.

### Tests (write the engine tests FIRST — pure function)

- Textbook MRP case (e.g. Orlicky/APICS example: 2-level BOM, LFL and fixed lot, lead times) with the exact expected
  record; safety stock floor; MOQ; multiple; scrap allowance exact; forecast consumption; past-due demand;
  frozen fence (no new orders inside); low-level codes with a shared component; BOM cycle exception; stable
  requisition ids across runs; cancelled requisition when demand disappears; RCCP levelling and the add-shift
  proposal; crew headcount/skills from stations; determinism (run twice → identical JSON).
- Integration: run → outbox events validate against contracts; release planned order → work order with due date.
- Planted bugs (at least): lot-for-lot rounds; safety stock ignored; lead-time offset skipped; forecast not consumed;
  frozen fence ignored; requisition id not stable; crew ignores station requirements.

## WP-G3 · Work order ↔ plan ↔ sales order — size S

Migration in `exe`: `exe_work_order.due_date TEXT`, `planned_order_id TEXT`, `pegging TEXT` (JSON), status `cancelled`
allowed only before any production fact (`POST /api/work-orders/:id/cancel`, reason). EXE2010/EXE3010 show due date,
pegging and "late" (due < today and not completed). `mes.work_order.released.v1` stays a draft (not needed).
Planted bug: cancel allowed after a fact.

## WP-G4 · Receiving and incoming inspection decision — size M

- Inbox accepts `acc.goods_receipt.v1` → `trk_material_lot` rows (supplier lot, qty, expiry, goods receipt ref,
  status `pending_iqc` when a `qms_plan` stage `iqc` exists for the item, else `accepted`); a voided receipt →
  lot status `voided` (refuse if already consumed: park `trk.lot_in_use`).
- Command `POST /api/qms/lots/:lotId/decision {decision, acceptedQty, rejectedQty, defectCodes, inspectionId}`
  (scope `qms.decide`, e-signature like hold release) → updates lot status, publishes `mes.lot_decision.v1`.
  Holding/releasing a material lot (existing holds) also publishes `on_hold` / `released`.
- Loading a lot at a station (`/api/stations/:code/loads`) is **refused** for lots `pending_iqc`, `rejected`,
  `on_hold`, `voided` (`lot.not_released`).
- Screens: QMS2040 incoming lots (pending / decided), decision dialog with AQL sample from ISO 2859-1 (existing
  `/api/qms/aql`).
- Tests + planted bugs: loading a pending lot; decision without e-signature; event not published.

## WP-G5 · Shipping against sales orders, on-time shipping — size M

- `shp_order` gains `customer_party_id`, and `shp_order_line` gains `so_id`, `so_line_no`; new creation path
  `POST /api/shipping-orders/from-sales-order {salesOrderId, lines:[{lineNo, qty}], shipDate, containerType,
  destination}`: qty ≤ open SO qty − qty on other open shipping orders (`shp.over_order`). Manual shipping orders
  without SO remain possible only when `ownership.item = 'gmes'` (standalone).
- Dispatch event fills `shipment.customer_party` and `lines[].sales_order`.
- KPI `GET /api/reports/on-time-shipping?from=&to=` per customer/SO line: dispatch date vs promised date minus
  transit days (`mdm_party` has no transit; add GMES-side setting `shp_transit_days(party_id, days)` default 0).
- SHP2020 screen: "from sales order" picker; SHP3030 on-time shipping report.
- Tests + planted bugs: over-order allowed; dispatch without SO ref in integrated mode.

## WP-G6 · Labour facts to HR — size S–M

At production-day close (the clock passes day start + 26 h, or `POST /api/labor/close-day`), compute per person:
minutes per line/station = the person's attendance `worked_minutes` (from `mdm_attendance_day`; else schedule
`paid_minutes`) split across lines/stations in proportion to the person's bookings (scans, completes, consumes)
that day; publish `mes.labor_day.v1` snapshots (version up on recompute). Route `GET /api/labor?date=`.
Screen RPT4040 labour by line. Test: split exact to the minute (largest-remainder rounding, total preserved).

## WP-G7 · GMES pusher and link-mizan retirement — size S–M

- Add the **pusher** of `01` §1.3 to `modules/eco` (table `eco_peer`, routes `GET/PUT /api/eco/peers`, loop in
  `main.ts`, `pushOnce` for tests, secrets via a `kernel/secrets.ts` helper with DPAPI through PowerShell on Windows).
  Peers: Mizan (types of 01 §1 GMES → Mizan), HR (`mes.crew_requirement.v1`, `mes.labor_day.v1`).
- When Mizan WP-M4 is on main: config `mizan.productionPosting = 'native'` stops link-mizan from consuming the four
  production facts (it keeps mirroring master data only until Mizan's own pusher is live, then it is not started at
  all). Keep link-mizan code and tests for one release; re-pin `scripts/fetch-mizan.ps1` to the Mizan commit that
  has M2–M4 and extend `apps/link-mizan/test/e2e.test.ts` → rename to "mizan-native e2e".

## WP-G8 · Layout link and live view — size M

- Publish `eco.plant_node.v1` for every plant node change (outbox); `GET /api/plant/export` (eco key, scope
  `eco.feed.read`) returns all nodes as an array of the contract (for Space Planner's "Fetch from GMES").
- Inbox accepts `eco.layout.snapshot.v1` → table `mdm_spatial_ref(node_id PK, layout_id, item_id, x, y,
  rotation_mdeg, w, d, revision)` (lengths in 0.1 mm integers, as sent) for items whose `eco_ref.type = plant_node`; MDM1010 plant screen shows
  position and a mini 2D map.
- SSE `GET /eco/v1/live?lines=` (scope `eco.live.read`, key in query param `k` for EventSource, CORS allow-list
  from settings — the Space Planner origin): events `station.state` {station, state running|stopped|held|starved,
  since}, `line.output` {line, good, scrap, hour}, `hold` {target}; heartbeat 15 s. Built on the existing board
  queries; never computes money.
- Tests: SSE sends a state change within 1 s of a stoppage fact; CORS refused for unknown origins.

## WP-G9 · Scenario adapter — size L (with WP-P3)

`apps/mes-server/scripts/scenario/` exporting `createApi(app)` used by the scenario engine: define plant from the
book (areas, lines, stations with `crew`, equipment, capacities), production shifts and calendar, UoMs, routings and
BOMs (approve), IQC/IPQC/OQC plans and defect codes, pack specs, label templates, station skill requirements;
day-level helpers: `runMrp()`, `firmAndRelease(policy)`, `receiveLotDecision(...)`, `produceShift(line, shift, date,
{planByWorkOrder, fpyByOp, defects, stoppages, crew})` which simulates serial units through the routing (**6 scan
points** for the simulation: panel load, board fit, function test, white balance + hi-pot, final inspection, pack),
backflushes, repairs FAILs, books stoppages; `packAndShip(...)`; `closeDay(date)`.
Keep `scripts/seed-demo.ts` (classic 14-day demo) working; `Start-Itqan-Demo.bat` gains `-Scenario` to load the
scenario artefact built by WP-P3 instead.
Performance target: 90 days × 2 FA lines × ~500 sets/shift × 6 scans ≈ 500k injects → < 15 min; measure and report.

## Phase-end docs for GMES (WP-D)

`HISTORY.md` (Symptom/Cause/Fix/Lesson per discovery from agent notes), ADRs in `docs/adr/README.md`
(038 plan-to-produce contracts; 039 planning engine in GMES (rejected: MRP in Mizan); 040 pusher + peers;
041 receiving and lot decision; 042 shipping from sales orders; 043 labour facts; 044 layout link + SSE live),
`docs/ecosystem/01..08` (ownership rows, contracts table, scenarios S8/S10/S11/S13+, the 4 known doc/code
mismatches: ack status `skipped`, push vs pull wording, snapshot version rule, S9 status), README.
