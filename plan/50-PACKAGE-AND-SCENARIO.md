# 50 — Package, pairing, scenario engine, verifier, security (repo `complete-company`)

Repo rules: PowerShell (`.ps1`, `.bat` wrappers) + Node ≥ 22.13 **without dependencies** (`node:` modules only).
Test: `pwsh -File scripts/test.ps1`. The package never reads another application's database: it talks to the
applications through their HTTP APIs only (the verifier too).

## WP-P0 · Housekeeping — size S (do first)

1. `scripts/Find-LeftoverMutations.ps1 [-Fix]`: for GMES reads `scripts/mutations.mjs` entries
   `{file, from, to}` by regex; for HR reads `migration/mutations.py` `MUTATIONS` with
   `python -c "import ast…"` (never import the module); reports any file containing `to` but not `from`; `-Fix`
   reverses. Add to `scripts/test.ps1` as an informational step.
2. Commit `plan/`, `research/`, `scenario/` (after the scenario book agent finishes), push.
3. After WP-M1/M2 merge: `git worktree remove` `_worktrees\mizan-sales`, `_worktrees\mizan-eco`, delete merged
   branches locally.

## WP-P1 · Pairing wizard — size M

Portal page `/pair` (served by `portal/server.mjs`, loopback only). For a **fresh** installation (all four apps
without business data) the wizard:
1. Asks each app's admin login (held in memory for the wizard session only, never written).
2. Reads Mizan's company id (`GET /api/eco/company`) — Mizan is the owner of the company identity.
3. GMES: sets `companyId`, `ownership {item: 'mizan', warehouse: 'mizan', person: 'hr'}` through a new GMES admin
   route `PUT /api/system/pairing` (**allowed only while GMES has no production facts**; otherwise refuse with
   `pairing.not_empty` → adoption is WP-P1b, later) and restarts GMES through its launcher.
4. HR: at HR setup, `company.source = 'owner'`, `owner_app = 'mizan'`, id = Mizan's (HR refuses to change it later).
5. Creates machine keys in each app via their admin routes (Mizan WP-M2, GMES `key add`, HR WP-H1) with the minimal
   scopes, and configures the peers: Mizan → GMES; GMES → Mizan, HR; HR → GMES (`/api/admin/integration`).
6. Round-trip test: create a test item in Mizan → wait until GMES mirrors it (≤ 30 s) → create a test employee
   in HR → GMES mirrors → show green; then deactivate the test records.
7. Writes nothing secret to disk; keys live only inside each app's protected store.
WP-P1b (later): adoption wizard for apps that already have data (GMES S10 scenario): map provisional ids, never
auto-merge.

## WP-P2 · Portal integration view — size S

Extend `/api/status` and the page: per app → running, version, company id (must be equal — red if not), per link →
last push OK time, pending, parked count (from each app's `/api/integration/events?status=parked` with a read key),
mirror age (GMES `/api/workforce/status`, item mirror age); a "Scenario" tab (WP-P5). Keep 127.0.0.1 only.

## WP-P3 · Scenario engine — size L (the demo builder)

Location `scenario/engine/` (ES modules). Run: `pwsh -File scripts/scenario.ps1 build [-Book scenario/book.json]
[-Out scenario/out/nile-vision]` → builds four demo data folders; `… verify` runs WP-P4; `… pack` zips the artefact.

### Architecture

```
 scenario.ps1 ─► node --import <GMES tsx loader> engine/main.mjs
                  ├─ Mizan   : import Accounting-sys/apps/server/src/app.ts  buildApp({dataDir, clock})  listen 127.0.0.1:0
                  ├─ GMES    : import GMES/apps/mes-server/src/app.ts        buildApp({dbFile, clock, config}) listen :0
                  ├─ HR      : child process python tools/scenario_hr.py serve-driver (HR_SIMULATION=1) + its HTTP server :0
                  └─ Space   : packages/starter sample (WP-S4) written as a project file (no running server needed)
```

- **Real HTTP between the apps** (each app listens on an ephemeral loopback port; peers configured with those URLs
  and real machine keys). The engine drives business actions through each app's public API (Mizan/GMES via
  `fetch` to the listening server or `app.http.inject`; HR via the driver) — **never** by writing a database.
- **Controlled time:** one simulated clock. GMES accepts `clock` already. **Mizan needs a clock option** (WP-M7: make
  `kernel/dates.ts nowIso()/today()` read an injectable clock set by `buildApp`; default real time). HR via
  `HR_SIMULATION=1` + driver `set_today` (WP-H7).
- **Pumps are explicit:** background push loops are off (`ECO_PUSH_LOOP=off` env for all apps); after each step the
  engine calls each app's "push now" admin route and repeats until all outboxes are drained (bounded, e.g. 5 rounds);
  it then asserts **no unexpected parked events** (the book lists the expected ones, e.g. none).
- **Determinism:** one seed (`book.meta.seed`) → per-domain PRNGs (demand noise, absenteeism, quality, downtime,
  payment behaviour). Two builds of the same book produce byte-identical business data (ids may differ where apps
  mint UUIDv7 — the verifier compares by codes).

### Day loop (window `book.meta.window.from … to`)

For each calendar day `d` (Fridays and holidays: only the steps that happen on rest days):

| Time (local) | Step | App(s) |
|---|---|---|
| 00:30 | set clocks to `d`; post FX rate of `d` | all, Mizan |
| 02:00 | nightly MRP run (`POST /api/pln/runs`) → pump | GMES → Mizan, HR |
| 07:00 | book events dated `d` (new sales orders, S&OP approvals on cycle dates, special events of arcs B–E) → pump | Mizan, GMES, HR |
| 07:30 | **planner policy** (book `policies.planner`): firm + release planned orders due within the release window (default: frozen fence), respecting line capacity; accept add-shift proposals listed in the book's events | GMES |
| 08:00 | **buyer policy** (`policies.buyer`): convert open requisitions whose `order_by_date ≤ d + review days`, grouped per default supplier, currency, incoterm; approve POs; LC or T/T per supplier terms; expedite decisions from events | Mizan |
| 08:30 | **HR policy** (`policies.hr`): read staffing gap for `d … d+14`; assign relief pool, request/approve overtime within caps, raise/approve requisitions for gaps beyond overtime capacity, hire from candidates after the book's hiring lead time, run training sessions, mark onboarding tasks | HR |
| per shift | generate attendance (absenteeism by seeded model, lateness), upload to HR; `produceShift` in GMES for each line running that shift with the crew actually present and qualified (below the required crew → throughput reduced proportionally, per book rule), stoppages from `downtime_model`, FPY by operation, repairs, backflush | HR, GMES |
| receipts | goods receipts for POs whose arrival date is `d` (sea/air lead times from the book), landed cost (freight, duty, clearance), import VAT, IQC decisions (arc D rejects a lot) → pump | Mizan, GMES |
| 22:00 | pack pallets, create shipping orders from SO lines due by promised date and stock on hand, load containers, OQC, dispatch → pump → Mizan deliveries + draft invoices; billing clerk posts invoices (ETA queue) | GMES, Mizan |
| 23:30 | Mizan: collections due today per customer behaviour (on time / late distribution, PDC cheques deposited on their dates), supplier payments per terms, bank charges; GMES: close production day (labour facts) → pump | Mizan, GMES → HR |
| month end | depreciation, FX revaluation, WIP/variance close, payroll (HR WP-H6 when built; **interim**: Mizan payroll module fed with the book's wage table and HR attendance/overtime totals — marked interim in the verifier), VAT return, S&OP cycle for next month (demand plan draft from baseline + consensus overrides from the book; supply review = MRP supply plan; approve) | all |

Output folder: `mizan/` (Mizan data dir), `gmes/` (GMES db + config), `hr/` (HR home), `space/` (project file),
`manifest.json` (book hash, app commits, build time, counts, SHA-256 per data file), `build.log`.
`Start-Complete-Company-Demo.bat -Scenario nile-vision` copies/points the demo data folders to the artefact.

Performance budget: < 20 min on the owner's PC; log timing per phase; if over, reduce scan points per unit (book
`simulation.scan_points`) before anything else.

## WP-P4 · Cross-system verifier — size M

`scripts/scenario.ps1 verify` → `engine/verify.mjs` starts the four apps on the artefact (read-only use), reads
through APIs only, and evaluates every entry of `book.json#checks` plus these fixed invariants:

| Area | Invariant |
|---|---|
| Quantities | For every item: GMES completed = Mizan production receipts; GMES consumed = Mizan production issues (by work order); GMES dispatched = Mizan delivered = invoiced (by SO line) |
| Stock | Mizan: opening + receipts − issues − deliveries ± adjustments = on hand; valuation = inventory GL accounts; QA-HOLD quantity = GMES lots on hold/rejected not yet returned; GMES stock mirror = Mizan |
| Planning | Every PO line from MRP has a requisition; every requisition is pegged; every work order has a planned order or a manual reason; no firmed order changed inside the frozen fence |
| People | Every production fact's person was employed, scheduled on that line/shift and qualified at the station on that date; overtime within caps; C-shift crew coverage ≥ the book's floor; payroll hours = attendance + approved overtime |
| Money | Trial balance balanced; AR = invoices − collections − credit notes; AP likewise; bank balances = statements; landed cost fully allocated; FX revaluation consistent with rates |
| Service | OTD / OTIF per customer from Mizan equals the book's expected values within tolerance; forecast accuracy, OEE, FPY, turns, DSO/DIO/DPO within `kpi_expected` tolerances |
| Integration | No parked events except expected; all outboxes drained; company id equal in all apps |

Output: `verify-report.html` (sections with pass/fail, numbers, drill-down codes) + `verify-report.json`; exit code 1
on any failure. `scripts/test.ps1` runs a **mini book** (`scenario/book.mini.json`: 1 line, 5 days, 1 order) build +
verify on every package test run.

## WP-P5 · Presentation — size S–M

Portal "Scenario" tab: the storyboard (`scenario/STORYBOARD.md` rendered), a timeline of arcs A–E with, per step,
the deep link into the right app screen (e.g. Mizan `/sales/orders/SO-00123`, GMES `#PLN2040`, HR staffing plan for a
date), and a KPI dashboard (targets vs actuals) read live from the apps. A printable "expert pack" (HTML) with the
verifier results.

## Security and operations (P7)

- **WP-X1 Secrets:** one DPAPI helper per app (Mizan/GMES `kernel/secrets.ts`, HR done in Phase A, Space Planner
  settings); migrate every stored key/password (link-mizan password, peer keys, GMES key in 3D) to it.
- **WP-X2 Pinned TLS:** each app creates a self-signed certificate on first start (`node:crypto` / Python `ssl` —
  HR per `docs/HR_SECURITY.md` §4 BAMS pattern); pairing exchanges SHA-256 fingerprints; pushers pin; HTTP stays
  available on loopback only. Then per-request HMAC over `method|path|sha256(body)|timestamp` with the machine key
  (replay window 5 min).
- **WP-X3 Operations:** portal shows each app's backup status; "Backup all" triggers each app's backup route and
  collects results; a restore rehearsal per app (HR has it; add to Mizan/GMES if missing); LAN install rehearsal
  checklist (Windows service or start-with-Windows per app).

## Phase-end docs (WP-D, every phase)

At the end of each phase ONE agent (not per task) updates, from the session reports' "notes for phase-end docs":
each repo's docs listed at the end of 10/20/30/40, `complete-company/README.md`, `ECOSYSTEM_INTEGRATION_REVIEW.md`
(status of gaps), and this plan's §3 "Current state" table. Hand-written docs are never updated mid-phase
(owner's instruction 2026-09-29).
