# Ecosystem integration review — one package for a small or mid-sized factory

Date: 2026-09-28
Scope: HR-System (`hr-system`), GMES (`GMES`), Mizan accounting (`Accounting-sys`), Space Planner (`3D-Modeling`)
Method: read all four repositories and the ecosystem design in GMES, then ran the real end-to-end suite
(`GMES\scripts\test.ps1 -SkipMutations`): **ALL GREEN, 80 tests** — 15 contract tests, 55 mes-server tests
(including `hr-e2e` against the real HR-System pinned at `45ec34a`), 10 link-mizan tests against the real Mizan
pinned at `a23c749`.

---

## 1. Verdict in one page

**The hard part is already designed and half built.** GMES holds a complete ecosystem design
(`GMES\docs\ecosystem\01..08`, ADRs 007–033) that answers the questions a package like this must answer:
who owns each piece of truth, how facts travel, how ids match across systems, what happens when one
system is down. The design is sound for the target customer (one server on a factory LAN, no IT team):

| Design choice (already made) | Why it is right for this package |
|---|---|
| One owner per truth; others keep read-only mirrors | No double entry, no "which number is right" |
| Facts travel as **events** (CloudEvents 1.0 JSON over HTTP), never as remote commands | Each app keeps working alone when another is down |
| **Outbox → Feed (pull with cursor) → Inbox (dedupe) → Acks**, no broker | Nothing extra to install or operate on the customer's PC |
| Shared ids: `company_id` (UUIDv7, set once) + `UUIDv5(company, "hr:employee:<code>")` etc. | Same id in every system without a mapping table |
| Quantities as exact decimal strings, refuse rounding | Manufacturing and accounting never disagree by a gram |
| One interface kit (`eco-ui`) shared by copy + hash | One look for the whole package |

**Technology recommendation: keep this stack. Do not add a message broker, a shared database, an ESB or a
"master data hub".** For a factory with one Windows server, Kafka/RabbitMQ/NATS add an operational
burden nobody will carry, and they break rule 5 of the ecosystem ("each app runs fully alone").
HTTP + JSON + SQLite outbox is the right amount of technology. What is needed is to **finish** the design
evenly across the four systems — today it is finished in GMES, half finished in HR, and absent in
Mizan and Space Planner.

### What works today (proved by the green run)

```
 HR-System ──eco.employee / attendance_day / schedule_day / qualification──▶ GMES inbox   ✅ tested (hr-e2e)
 Mizan ──items, warehouses──▶ link-mizan ──eco.item / eco.warehouse──▶ GMES inbox         ✅ tested (link-mizan e2e)
 GMES feed ──mes.material.consumed / production.completed / work_order.closed──▶ link-mizan ──▶ Mizan stock docs + journal  ✅ tested
 GMES refuses unknown / inactive / unqualified people at a station                             ✅ tested
 Outbox survives the other side being down; duplicates recognised; parked events visible         ✅ tested
```

### What is missing (ranked by how much it blocks "one package")

| # | Gap | Where | Blocks |
|---|---|---|---|
| 1 | **Mizan has no integration layer**: cookie sessions only, no API keys, no company UUID, no outbox/feed, no inbound inbox, no unique `reference` | Mizan | Payroll from HR, cost back to GMES, any future consumer, security (link logs in as a user) |
| 2 | **Nothing starts the connectors in production**: HR's `eco_publisher.py` is never started by the installed product and has no settings screen; `link-mizan` is "manual run", not started by `Start-GMES.bat` | HR, GMES | Integration works in tests but not on a customer PC |
| 3 | **Space Planner has zero ecosystem code**: no company id, no `eco.ref`, no snapshot export, no station import | 3D | Layout ↔ stations, live plant view |
| 4 | **No pairing step**: `company_id`, URLs and keys are environment variables typed by hand in three places | all | Installation by a non-IT person |
| 5 | **Payroll → Mizan is design only** (`hr.payroll_period.v1`), and Mizan still has its own employees table + payroll runs | HR, Mizan | Two truths for people and pay |
| 6 | **Security between apps is a bare API key over plain HTTP**; Mizan link password is meant for DPAPI but isn't there yet | all | LAN deployment beyond one PC |
| 7 | No live view (`/eco/v1/live` SSE), no nudge, no management dashboard (S11), no adoption wizard (S10) | GMES | Nice-to-have for the demo story |
| 8 | Four places where docs and code disagree (ack status name, push vs pull for HR, snapshot version rule, S9 stale) | GMES docs | Confuses the next developer |

---

## 2. System-by-system findings

### 2.1 GMES (manufacturing) — the ecosystem's reference implementation
- **Built:** `eco` module with `eco_outbox` (written in the same transaction as the ledger line, UPDATE/DELETE
  blocked by triggers), `GET /eco/v1/feed?after=&limit=`, `POST /eco/v1/inbox`, `POST /eco/v1/acks`,
  `GET /api/integration/events` (exceptions view), health checks `feed_gap_free` / `no_parked_events`.
  Scoped API keys (`x-eco-key`, hash stored, printed once). Owner switches `ownership.item = mizan|gmes`,
  `ownership.person = hr|none` with a tested rollback path (ADR-021, ADR-031).
- **Contracts package** `@eco/contracts`: 12 contracts, zod → JSON Schema (`npm run schemas`), stale-schema
  test, shared Python↔TS canonical vectors. This is the right "contract of record" for the whole package.
- **link-mizan:** complete connector (master-data mirror, feed consumer, WIP tracking, parked/held-behind
  handling, replay from zero). Runs as a separate Node loop every 10 s. **Not launched by `start.ps1`.**
- **Missing in GMES:** TLS between apps, signed ledger v2, backup, device roster (`E8.5`), `/eco/v1/live`,
  nudge, any Space Planner code (`mdm_plant_node` has no spatial fields).
- **Doc/code mismatches to fix:** (1) ack status `skipped_duplicate` in doc 03 vs `skipped` in code;
  (2) doc 01 says "pull, not push" but HR and link-mizan push into GMES's inbox — both directions are
  legitimate, the doc should say so; (3) doc 05 S1 "version = fingerprint" vs code "fingerprint is not a
  version"; (4) doc 05 S9 still lists shifts/skills/qualification gate as not built.

### 2.2 HR-System (people) — publisher built, not wired into the product
- **Built:** `eco_publisher.py` with SQLite outbox (`eco_outbox.db`), CloudEvents envelope, SHA-256 change
  detection, monotonic version, batches of 200 to `POST {ECO_GMES_URL}/eco/v1/inbox`, retries on 5xx/429,
  per-event delivered/rejected states. Four contracts: `eco.employee.v1` (no personal data),
  `eco.attendance_day.v1`, `eco.schedule_day.v1` (14 days ahead), `eco.qualification.v1`.
  Company id from Mizan (pasted) or local provisional UUIDv7 (`config.json`), refuses to open a registry
  under another company. Signed journal, verified backups, device identity, Windows installer.
- **Gaps:** the installed program never starts the publisher; configuration is env-vars only
  (`ECO_COMPANY_ID`, `ECO_GMES_URL`, `ECO_GMES_KEY`), no settings screen; no inbound endpoint for other
  apps (push-only, fine for now); no TLS; company-id adoption planned only; `eco_schemas/README.md` lists
  3 of 5 schemas. Not published: org units, shift definitions, discipline (correct — those stay in HR).
- **Payroll:** design only (`docs/HR_PAYROLL_DESIGN.md`), with a five-point gate before building. Contract
  `hr.payroll_period.v1` (totals per cost centre × account key, no names) is not yet in `@eco/contracts`.

### 2.3 Mizan (accounting) — strong product, no ecosystem awareness
- 25 modules, clean "mechano" boundaries, in-process event bus, editions, demo built through the API.
- **Nothing outbound or inbound for other systems.** Auth is `mizan_sid` cookie only; no API keys, no bearer;
  `Authorization` header never read. No company UUID (company is a settings JSON row). No outbox, no feed,
  no inbox. `reference` on stock docs/journal is not unique — link-mizan's idempotency relies on `?q=` search.
- **Production path overlaps:** link-mizan books GMES production as plain `adjustment` stock documents against
  a WIP account (ADR-019 interim), while Mizan's own `manufacturing` module (`/api/mfg/orders`, `produce()`)
  is a second way to record the same thing. Mizan's ADRs and roadmap never mention GMES/HR/Space Planner.
- **Ownership conflict:** Mizan stores `employees` and runs payroll (ADR-017), while the ecosystem says
  HR-System owns people and computes pay (GMES ADR-022, HR design). Both are "correct" in their own repo;
  the package needs one answer (see §4, decision 1).

### 2.4 Space Planner (3D-Modeling) — excellent standalone tool, not yet a citizen
- Pure TypeScript core, Node server + SQLite on `127.0.0.1:4600` (loopback by design — it runs AI agents),
  React + three.js editor, JSON project export/import, SSE `/api/events`, agent tools over MCP.
  392 unit tests + 22 browser journeys in CI.
- **No company id, no users, no `eco.ref`, no snapshot export, no mention of GMES/HR/Mizan.**
  A production line is a flat list of items with `meta.kind` (`source|machine|buffer|inspection|sink`) and
  `meta.step`; there is no area→line→station hierarchy, no shifts, no capacity beyond buffers.
- The ecosystem docs already reserve its role: owner of spatial layout and storage-location addresses;
  links a drawn element to a GMES station via `item.meta["eco.ref"] = "eco:station:<uuid>"`;
  delivers `eco.layout.snapshot.v1` as an exported file; shows live state by subscribing (from the
  browser) to GMES SSE. `Meta` is a free map, so all of this fits without touching the core.

---

## 3. Data flows the package needs — required vs. existing

Legend: ✅ built and tested · 🟡 built, not deployed/wired · 📐 designed, not built · ❌ not designed

| From → To | Data | Contract | Status |
|---|---|---|---|
| Mizan → GMES | Items, units, warehouses (master data) | `eco.item.v1`, `eco.warehouse.v1` | ✅ via link-mizan (🟡 not auto-started) |
| GMES → Mizan | Material consumed, production completed, work order closed | `mes.material.consumed.v1`, `mes.production.completed.v1`, `mes.work_order.closed.v1` | ✅ via link-mizan (🟡 not auto-started) |
| GMES → Mizan | Scrap | `mes.production.scrapped.v1` | published, deliberately not posted in v1 (ADR-019) |
| Mizan → GMES | Actual cost of production (for costed reports in MES) | `acc.production.costed.v1` | 📐 |
| HR → GMES | Employees (no personal data), attendance days, 14-day schedule, qualifications | `eco.employee.v1`, `eco.attendance_day.v1`, `eco.schedule_day.v1`, `eco.qualification.v1` | ✅ (🟡 publisher not started by product) |
| GMES → HR | Labour hours actually worked at stations (`performed_by.person`) | `mes.labor.*` | 📐 |
| HR → Mizan | Payroll period totals per cost centre / account, no names | `hr.payroll_period.v1` | 📐 (gate in HR_PAYROLL_DESIGN §2) |
| Mizan → HR, GMES, 3D | Company identity, cost centres | `eco.company.v1` (+ cost centres) | 📐 — today company id is hand-copied |
| Mizan → all | Customers/suppliers, material lots | `eco.party.v1`, `eco.material_lot.v1` | 📐 |
| GMES → 3D | Lines, stations, equipment ids to tag drawn elements | `eco.line.v1`, `eco.station.v1`, `eco.equipment.v1` | 📐 |
| 3D → GMES | Layout snapshot with `eco.ref` per element, storage locations | `eco.layout.snapshot.v1`, `eco.storage_location.v1` | 📐 |
| GMES → 3D (browser) | Live equipment state, quality holds | `mes.equipment.state.v1`, `mes.quality.hold.v1` over SSE `/eco/v1/live` | 📐 |
| HR → 3D | Headcount per area / who is where (for occupancy, canteen, HR floor) | none | ❌ (optional; can reuse `eco.schedule_day.v1`) |
| All → one place | Health, parked events, mirror age of every link | S11 dashboard | 📐 |

---

## 4. Decisions the owner must make (defaults taken so work can continue)

1. **Mizan's employees + payroll module.** Default: keep the module but reframe it as *"payroll posting
   from HR"* (GMES ADR-022, HR handoff note). No new employee features in Mizan; when `hr.payroll_period.v1`
   lands, Mizan books it and the `employees` table becomes optional. Alternative: keep Mizan payroll as a
   standalone edition for customers without HR-System — possible, but then the package must switch it off
   when HR is paired.
2. **Single sign-on.** Default: **not now.** Accounts stay per application (ecosystem rule "user account:
   each app, never shared"). Give the customer one **portal/launcher page** that links the four apps and shows
   their health. Revisit after the pairing wizard exists; if wanted later, a small local OIDC provider is
   the standard answer, not shared session cookies.
3. **Broker or not.** Default: **no broker.** HTTP CloudEvents feed/inbox/acks stays. Add the "nudge"
   (producer POSTs an empty hint to the consumer so it pulls immediately) if 10-second latency ever matters.
4. **Production posting in Mizan.** Default: build a native `production` document kind in Mizan (issue to
   WIP / receipt from WIP) and retire the `adjustment` workaround (E6 #8). Alternative: keep adjustments
   forever — cheaper, but accountants will see "ADJ-" documents for production.

---

## 5. Technology choices — what to use and what to avoid

| Concern | Use | Avoid | Reason |
|---|---|---|---|
| Transport | HTTP/1.1 + JSON, CloudEvents 1.0 envelope (already in `@eco/contracts`) | Kafka, RabbitMQ, NATS, MQTT for app-to-app | Zero extra services on the customer PC; outbox in SQLite already gives durability |
| Delivery | Outbox in the writer's transaction; consumer pulls `/eco/v1/feed` with a cursor; producer may also push to `/eco/v1/inbox`; acks; `(source,id)` dedupe | Fire-and-forget webhooks without outbox; shared DB tables | At-least-once + dedupe = effectively once, proven by tests |
| Contracts | zod in `@eco/contracts` → generated JSON Schema; Python validates the same schema files (already done in HR) | Hand-written per-language types, protobuf/gRPC | One source, two languages, byte-identical copies checked by tests |
| Identity | `company_id` UUIDv7 set once at pairing; `UUIDv5(company, "<app>:<type>:<key>")` for owner keys; UUIDv7 for new facts | Mapping tables, local numeric ids on the wire | Already implemented in TS and Python with shared vectors |
| Auth between apps | Scoped API keys in `x-eco-key` now (GMES pattern) → pinned TLS 1.3 + Ed25519 device identity + per-request HMAC (E8.2, BAMS pattern) | Reusing human user accounts (current Mizan link), basic auth | Machine identity, revocable, no password rotation problem |
| Secrets on Windows | DPAPI (`ProtectedData`) for keys/passwords in each app's config | Plain env vars / plain config.json | Already planned for link-mizan |
| Live views | SSE (already in GMES ADR-009 and Space Planner server) | WebSockets, polling from the UI | One-way, simple, proxy-friendly |
| Space Planner ↔ GMES | JSON snapshot file export/import + browser-side SSE; optional same-machine connector | Opening the 3D server to the LAN | 3D server is loopback-only on purpose (runs agents) |
| UI | `eco-ui` kit copied by hash (ADR-029) — extend to Mizan and 3D over time | Four visual languages | One product feel |
| Packaging | One `Start-Complete-Company.bat` → PowerShell supervisor that starts the four servers + connectors, health-checks them, and opens the portal; later Windows Services via `sc.exe`/NSSM-free (`New-Service`) | Docker on customer PCs | Owner works on Windows; PowerShell-only tooling rule |
| Reporting across apps | Each app's own read API + the S11 dashboard reading `/eco/v1/*` and `/api/system/health` | A data warehouse | Out of scope for the first package |

---

## 6. Phased plan

Sizes: S = days, M = 1–2 weeks, L = 3+ weeks of focused work. Each phase ends green in every repo's own
definition of done (typecheck, tests, mutations, docs) and is pushed to `main`.

### Phase A — make what exists actually run on a customer PC (S–M)
1. **HR:** start `eco_publisher` from `hr_main.py` as a background thread when `eco.gmes_url` is set;
   move `ECO_*` from env vars into `config.json`; add an *Integration* settings screen (URL, key, company
   id, last delivery, pending/rejected counts). Publish `eco_schemas/README.md` for all 5 schemas.
2. **GMES:** `start.ps1` launches `link-mizan` when `data/config.json` has a Mizan section; store the link
   password with DPAPI; show link health in `GET /api/system/health`.
3. **GMES docs:** fix the four mismatches (§2.1).
4. **Package:** `Start-Complete-Company.bat` + `scripts\start-all.ps1` at the *Complete Company* level
   (the folder is not a git repo — decide whether to create a fifth repo `complete-company` for launcher,
   portal and pairing) that starts Mizan (4800), GMES (4700), HR (8766), Space Planner (4600) and opens a
   portal page with four tiles and health lights. Demo variant starts the demo data folders with
   `admin / 123`.

### Phase B — Mizan becomes an ecosystem citizen (M–L)
1. New module `eco` in Mizan (respecting the mechano rules): `sys_key`-style API keys with scopes
   (`x-eco-key`), `company_id` setting (UUIDv7 created at setup or pasted from pairing),
   `eco_outbox` written in the same transaction by subscribing to the in-process bus
   (`journal.posted`, `stock.receipt.posted`, item/warehouse/party changes),
   `GET /eco/v1/feed`, `POST /eco/v1/inbox`, `POST /eco/v1/acks`, `GET /api/integration/events`.
   Add `eco.company.v1`, `eco.party.v1`, `eco.material_lot.v1`, `eco.cost_center.v1` to `@eco/contracts`.
2. Unique index on `reference` for stock documents and journal entries (idempotency at the database).
3. `production` stock-document kind (issue to WIP / receipt from WIP) with `costCenterId`; retire
   the `adjustment` path in link-mizan; emit `acc.production.costed.v1`.
4. Shrink `link-mizan` to a thin adapter or fold it into Mizan's `eco` module (GMES pulls Mizan's feed
   directly, Mizan pulls GMES's feed directly). Keep the e2e tests, re-pin.
5. Implement decision 1 (payroll module → "posting from HR"), documented as a Mizan ADR.

### Phase C — Space Planner joins (M)
1. `company_id` + `eco.ref` support: a *Link to plant* panel that pulls `GET /api/plant` (or a pasted JSON)
   from GMES and lets the user tag stations/zones with `eco:station:<uuid>` / `eco:warehouse:<uuid>`.
2. Export `eco.layout.snapshot.v1` (positions, sizes, rotations, `eco_ref`) and `eco.storage_location.v1`
   from a project; GMES imports the snapshot (new inbox types) and stores `spatial_ref` on plant nodes.
3. GMES `/eco/v1/live` SSE (`mes.equipment.state.v1`, `mes.quality.hold.v1`); Space Planner *Live* view
   subscribes from the browser and colours tagged stations. Server stays loopback-only.
4. Optional: `eco.line.v1/station.v1/equipment.v1` as proper contracts so 3D can propose new stations to
   GMES (proposal, not creation — GMES stays the owner).

### Phase D — payroll and labour (L, gated)
1. HR: finish the §2 gate (attendance bound to registry, leave, overtime, one trial month) — owner's rule.
2. `hr.payroll_period.v1` into `@eco/contracts`; HR publishes it; Mizan `eco` inbox books one entry per
   period and cost centre with the connector-side account mapping.
3. GMES → HR `mes.labor.v1` (minutes per person per station per production day) for labour costing and
   overtime evidence.

### Phase E — security and operations for real LANs (M)
1. Pinned TLS between apps (BAMS pattern, `docs/HR_SECURITY.md` §4) and Ed25519 device identity;
   `x-eco-key` becomes a signed session (E8.7 F4).
2. Pairing wizard in the portal: creates `company_id` once, exchanges keys, writes each app's config,
   runs a round-trip test; adoption wizard for a provisional HR company id (S10).
3. S11 dashboard: parked events, mirror ages, backup status of all four apps in one page.
4. GMES backup + signed ledger v2 (E8.5), Mizan HTTPS helper, HR TLS.

---

## 7. Rules to keep while doing this (already in the repos — do not relax them)
- Never read or write another application's database; integration is `@eco/contracts` events over HTTP.
- Master data flows only from its owner; no "temporary" copies; adoption only through a wizard.
- No money in GMES; no employees or pay calculation outside HR; no geometry outside Space Planner.
- Contracts are versioned in the name; additive = same version; breaking = new `vN`.
- Quantities are exact decimals; refuse what would round.
- A new contract is added in `GMES/packages/eco-contracts` first, then copied byte-identical to HR.
- Tooling is PowerShell/.bat only.
- Each repo's own definition of done (tests, mutations, docs, ADR/HISTORY entries) applies to every step.

---

## 8. Immediate next actions (if approved)
1. Create the fifth repository `complete-company` (launcher, portal, pairing, this review) — or confirm the
   launcher should live inside GMES.
2. Start Phase A in HR and GMES (small, unblocks demos on a single PC).
3. Open the Mizan `eco` module ADR (Phase B) and record decision 1 in Mizan's `docs/DECISIONS.md`.
