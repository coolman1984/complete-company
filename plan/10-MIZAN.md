# 10 — Mizan (repo `Accounting-sys`) work packages

Read first: `Accounting-sys/CLAUDE.md` (mechano rules), `docs/MAP.md` (who owns what), `docs/DECISIONS.md`.

## 0. Conventions (apply to every WP)

- A feature is an `AppModule` (`apps/server/src/kernel/modules.ts`): folder `apps/server/src/modules/<id>/`
  with `index.ts` (module: `id`, `dependsOn`, `migrations`, `permissions`, `setup`, `routes`, `apps`, `roles`,
  `sod`, `health`), optional `schema.ts`, `service.ts`, `engine.ts`. Register in `modules/index.ts` and
  `scripts/edition.mjs` (the edition test fails otherwise).
- A module imports only `kernel/`, `contracts/`, the core modules (`system`, `ledger`) and its own folder
  (`test/boundaries.test.ts`). Talk to other modules through **services typed in `contracts/`**, the in-process
  **event bus** (`kernel/events.ts`, runs inside the DB transaction), or a **registry**. Never write another
  module's tables.
- Money = integer minor units (`kernel/money.ts`), quantities ×1000, rates in basis points. Post to the books only
  through the ledger service. Stock only through the inventory service.
- Permissions `module.object.action` (read, write, post, approve, manage, override) + texts `perms.objects.*`
  in `apps/web/src/core/locales/en.ts` and `ar.ts`. Every visible text in both dictionaries (tsc checks the shape).
- Web: `apps/web/src/modules/<m>/` imports only `core/`, `ui/`, `engines/`, `lib/`, `styles/` and itself.
- Validation with zod helpers from `kernel/validate.ts` (`zDate`, `zId`, `zBp`, `paging`, `parse`).
- Errors: `kernel/errors.ts` (`fail`, `conflict`, `notFound`, `forbidden`) with stable codes `<module>.<reason>`.
- Tests: `apps/server/src/test/*.test.ts` with `helpers.ts` (in-memory DB, `admin` user `password123`).
- Done = `npm run typecheck` + `npm test` + `npm run docs:map` green; hand-written docs at phase end only.

---

## WP-M1 · Sales, ATP, deliveries, OTD/OTIF, S&OP (IN PROGRESS — branch `feat/sales-sop`, worktree `_worktrees\mizan-sales`)

Spec given to the building agent (acceptance checklist for the reviewer/merger):

| # | Must be true | How to check |
|---|---|---|
| 1 | Module `sales` (and `sop` if split) registered, edition updated, both locales, permissions with texts | typecheck + edition test |
| 2 | Sales order draft→confirmed→partially_delivered→closed / cancelled; lines with requested + promised date, delivered + invoiced qty; credit-limit check on confirm | test |
| 3 | Reservations never make available < 0; released by delivery / cancel | test |
| 4 | ATP(item, qty, date) = on hand − reserved + open PO receipts by expected date + `sales_supply_plan` → first full-availability date | test with an open PO |
| 5 | Delivery post issues stock once (goods issue + COGS); invoice from delivery does **not** issue again; invoices without delivery unchanged; credit notes unchanged | test + stock valuation = GL 1140 |
| 6 | Programmatic `deliver(soLine, qty, date, warehouse, reference)` idempotent on reference | test |
| 7 | OTD / OTIF per customer/item/month (vs promised and vs requested), backlog, fill rate, sales by customer | crafted test |
| 8 | Demand plan versions per cycle, approve as a separate duty, supersede; demand vs supply (`sop_supply_plan`) vs `budget_sales`, gap in qty and money | test |
| 9 | Registry hooks returning SO snapshots and approved plans for the eco module (no eco code inside sales) | code review |
| 10 | Screens EN/AR: SO list/form + ATP, deliveries, invoice from delivery, OTD/OTIF, sales by customer, S&OP grid | manual + typecheck |

Merge order: merge **WP-M2 first if both are ready**, then rebase WP-M1 and resolve shared files (locales,
modules index, edition, MAP) by regenerating.

## WP-M2 · Purchasing depth + native eco module (IN PROGRESS — branch `feat/purchasing-eco`, worktree `_worktrees\mizan-eco`)

Acceptance checklist:

| # | Must be true |
|---|---|
| 1 | Item planning fields (material type, procurement, lead time days, MOQ, lot rule + size, safety stock, default supplier) in DB, API, item form EN/AR |
| 2 | Purchase requisitions (manual / mrp), open→converted→closed / cancelled; convert many→one PO (same supplier) with per-line link |
| 3 | PO currency + rate, line expected date, incoterm, ports; receipt valued at PO currency × receipt-date rate; 3-way match intact |
| 4 | Letters of credit per PO (optional): margin deposit, bank charges, settlement with bank financing — all postings balanced |
| 5 | Company id UUIDv7 (setup + migration for existing DBs), `GET /api/eco/company`, shown in Settings |
| 6 | Machine keys (hash only), `x-eco-key` only on `/eco/v1/*`, scopes enforced (401/403) |
| 7 | Vendored `eco-contracts` byte-identical with SHA-256 pin test |
| 8 | Outbox in-transaction (rollback leaves no event), gap-free feed, acks, inbox with dedupe and per-event results, `/api/integration/events`, health checks |
| 9 | Publishers: item, warehouse, party, stock_position (reserved via registry, default 0), purchase_order |
| 10 | Consumers: `mes.purchase_requisition.v1` (upsert / cancel / reschedule message if converted), `mes.supply_plan.v1` → `eco_supply_plan` |

**Add in WP-M2 or at the start of WP-M3 if missing:** the **pusher** (01 §1.3): table `eco_peer(name PK, url, key_enc,
types JSON, cursor INTEGER, last_ok_at, last_error, active)`, admin routes `GET/PUT /api/eco/peers`,
background loop started in `main.ts` (not in tests; tests call `pushOnce(peer)`). Peer keys are secrets: never in the
DB in clear, never in a backup or log. On Windows protect them with DPAPI by calling PowerShell
(`[Security.Cryptography.ProtectedData]::Protect(..., 'LocalMachine')`) through `child_process.execFileSync` — no
npm dependency; elsewhere store `data/secrets/<peer>.key` with owner-only permissions. One helper
`kernel/secrets.ts` (`protect(name, value)`, `reveal(name)`) used by every module that stores a machine secret.

## WP-M3 · Integration wiring (after M1 + M2 are on main) — size M

Goal: every Mizan-side flow of `01-CONTRACTS-AND-FLOWS.md` §3 works against a real GMES.

1. **Publish** `acc.sales_order.v1` (F1) and `acc.demand_plan.v1` (F2) through the registry hooks of M1; reserved
   qty into `acc.stock_position.v1` (F3). Snapshot versions monotonic per entity (`max(prev+1, now_ms)` like GMES).
2. **Publish** `acc.goods_receipt.v1` on goods-receipt post/void (F5), after WP-C1 adds the contract.
3. **Consume** `mes.shipment.dispatched.v1` (F7): deliveries per SO line through M1's `deliver()`, draft invoice from
   the delivery; parking codes `sales.no_order`, `sales.over_delivery`, `sales.order_closed`.
4. **Consume** `mes.lot_decision.v1` (F5): quarantine warehouse `QA-HOLD` (create on first use, one per company),
   automatic transfer in/out with reference `eco:<event id>`; draft purchase return (`purchase_credit` against the
   bill if billed, else a receipt reversal line) for `rejected_qty`; supplier claim note.
5. **S&OP supply view** reads `eco_supply_plan` (replace M1's `sop_supply_plan` table or map it — one table only).
6. **ATP** reads GMES supply (planned completions) from `eco_supply_plan` monthly buckets split to days by working
   days, only when no better data (document the rule in the report).
7. **Reschedule messages**: when a converted requisition changes date/qty, show a warning on the PO line
   (`purchasing.reschedule`) with the new need date; a buyer decides.
8. **End-to-end test** in Mizan against GMES: add `scripts/fetch-gmes.ps1` (pinned GMES commit, like GMES's
   `fetch-mizan.ps1`) and `apps/server/src/test/gmes-e2e.test.ts` (skipped unless `MIZAN_E2E_REQUIRED=1` and a
   GMES checkout): start GMES in-process from the checkout with a controlled clock, pair (company id, keys, peers),
   run: party + item + SO → GMES mirror; GMES MRP publishes a requisition → Mizan PR; PR → PO → GR → GMES lot →
   IQC reject → Mizan quarantine; shipment dispatched → Mizan delivery + draft invoice; SO delivered qty back in GMES.
9. Screens: Integration settings (company id, keys, peers with status, pending/parked counts, "push now"),
   Exceptions (parked events with code, retry after fix).

Tests (unit, in Mizan): each consumer's results (applied/unchanged/stale/duplicate/rejected) incl. parking codes;
publishers emit exactly one snapshot per entity per transaction; quarantine transfers balanced; no double stock
issue from a shipment + invoice.

## WP-M4 · Native production posting (retire the adjustment workaround) — size M

ADR to record at phase end: "Production documents in Mizan for MES facts" (rejects: keep ADJ- adjustments forever).

1. New stock document kinds in `inventory`: `production_issue` (component to WIP account, at moving average),
   `production_receipt` (finished/semi item from WIP at the order's WIP value), both with `work_order_ref`
   (GMES work order id + code) and `reference = eco:<event id>` **unique** (unique index on `stock_docs.reference`
   where not null — also add for `journal_entries.reference`).
2. WIP ledger per GMES work order in Mizan (`mfg_wip(work_order_id TEXT PK, code, item_id, planned_qty, issued_value,
   received_value, received_qty, status)`) — the value side lives in accounting, never in GMES.
3. Consumers: `mes.material.consumed.v1` → production_issue; `mes.production.completed.v1` → production_receipt
   (final completion takes the remainder of WIP; non-final at `issued_value × qty / planned_qty` capped by what is
   left); `mes.production.scrapped.v1` → no posting (normal scrap absorbed, ADR-019 kept) but recorded on the WIP
   row; `mes.work_order.closed.v1` → remaining WIP to production variance account (5170 default, configurable).
4. Checks: `health` — WIP account balance = Σ open `mfg_wip` (issued − received); every production doc has a unique
   reference.
5. Keep Mizan's own `manufacturing` module (BOM costing, production orders) for customers **without GMES**; when a
   GMES peer is active, the manufacturing app shows "Production is recorded by GMES" and blocks manual production
   orders (switch `mfg_settings.source = 'gmes' | 'mizan'`).
6. Tests: the link-mizan e2e scenarios (S2, S3, S3b, S5, S6, S7 in `GMES/docs/ecosystem/05-end-to-end-scenarios.md`)
   re-expressed as Mizan consumer tests; the GMES side switches off link-mizan in WP-G7.

## WP-M5 · Payroll posting from HR (reframe Mizan payroll) — size S–M

1. Consumer `hr.payroll_period.v1` → one balanced journal per period × cost centre: debit expense keys
   (`gross_earnings`, `overtime`, `night_allowance`, `employer_social_insurance`, `agency_labour`) to the mapped
   expense accounts on the cost centre; credit liabilities (`employee_social_insurance` + employer part → social
   insurance payable, `salary_tax` → tax payable, `other_deductions` → other payables, `net_payable` → salaries
   payable). Mapping table `payroll_account_map(account_key PK, account_id, side)` editable in Settings.
   Refuse unbalanced (`payroll.unbalanced`) and unknown cost centre (`payroll.unknown_cost_center`).
2. `reversed` status → reversing journal.
3. Payment: existing payment/bank flow pays `salaries payable` (one bank transfer to the payroll account + the
   bank's bulk file is out of scope).
4. Mizan `payroll` module: keep for standalone customers; when an HR peer is active, runs are disabled with
   "Payroll is calculated by HR-System" (switch `payroll_settings.source = 'hr' | 'mizan'`). The employees table is
   not used in that mode.
5. Tests: mapping, balance, reversal, idempotency, source switch.

## WP-M6 · KPI pack and executive S&OP view — size S

Screens + routes `GET /api/kpi/pack?month=`: OTD/OTIF (M1), forecast accuracy (1 − Σ|actual − plan| / Σ actual,
SKU × month, lag 1, from approved demand plans vs invoiced qty), forecast bias, inventory turns and days of cover
(from valuation and COGS), DSO/DIO/DPO/cash-to-cash (analysis module), gross margin by model, supplier OTD (M2),
PPV (from receipt matches), production variances (M4), payroll cost per set (M5 ÷ units produced from GMES facts
mirrored in `mfg_wip`). Executive S&OP page: demand vs supply vs budget, revenue gap, top 5 constraints from
`eco_supply_plan`.

## WP-M7 · Scenario adapter — size M (with WP-P3)

**First: an injectable clock.** Today `buildApp(config)` uses real time (`kernel/dates.ts nowIso()` and every "today"
check: lock dates, fiscal year, due dates, ETA timestamps). Add `buildApp(config, { clock })` with
`clock: { now(): Date }` (default real time), route every time read in server code through it, and add a test that
fails if `new Date()` / `Date.now()` appear in `apps/server/src/modules/**` outside tests (same idea as GMES).

`apps/server/src/demo/nile-vision.ts` + CLI `npm run demo:nv -- --book <path> --data <dir>` that builds the Mizan
side of `complete-company/scenario/book.json` through the HTTP API (`app.http.inject`, same pattern as
the existing electronics demo company): company, chart of accounts, VAT 14%, cost centres, banks, parties with terms and credit
limits, price lists, items with planning fields, opening balances and stock, FX rates, budgets. The day-by-day
business actions are driven by the scenario engine (WP-P3) through an exported function API:
`createApi(app)` returning typed helpers (`confirmSalesOrder`, `approveDemandPlan`, `convertRequisitions`,
`receiveGoods`, `postLandedCost`, `postInvoice`, `collect`, `payroll`, `closeMonth` …). Test: build the opening
state in `:memory:` and check trial balance, stock = GL, parties count.

## Phase-end docs for Mizan (WP-D, once per phase)

`docs/CHANGELOG.md` (Added/Changed/Fixed), `docs/DECISIONS.md` ADRs (sales/S&OP module; purchasing depth + LC;
native eco module + vendored contracts; production documents for MES facts; payroll posting from HR),
`docs/ARCHITECTURE.md` (integration section), `docs/ROADMAP.md` (tick), `docs/LESSONS.md` (from agent notes).
