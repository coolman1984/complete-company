# Reference projects study — what the main project should learn

Date: 2026-09-30 · Status: study only (no code changed in any repository)

## 0. Which project is which (owner's decision, 2026-09-30)

| Role | Repositories |
|---|---|
| **Main project** — the *Complete Company* package | `complete-company` (launcher, portal, pairing, scenario, plan), `Accounting-sys` (Mizan), `GMES`, `HR-System`, `3D-Modeling` (Space Planner) |
| **Reference only** — learn ideas and experience, never build the package inside them, never modify them from here | `Mr.Ayman-HR` (BAMS), `Yousef-Transportation` (Trip Orders), `Self-Business-App` (Self Business OS), `opening-nerp-tcode` (G-MES/N-ERP automation) |

The master plan (`plan/00-MASTER-PLAN.md`) already borrows from BAMS for security (pinned TLS, Ed25519 device
identity, DPAPI). It does **not** yet use anything from Trip Orders, Self Business or the earlier automation project.
This file lists what is worth taking, where it fits in the plan, and what must not be copied.

## 1. What each reference is good at

| Reference | Its strongest experience | Relevance to the package |
|---|---|---|
| **BAMS** (`Mr.Ayman-HR`, v2.4) | Several PCs that work alone and share changes; signed hash-chained history; pinned TLS; personal links; backups; installer that installs and updates; `IDEAS.md` (≈40 cards) | Security and operations (P7), backups (WP-X3), delivery, the "never erase / restore is a new change" discipline. HR-System already vendors its signing code. |
| **Trip Orders** (`Yousef-Transportation`, v1.0) | How to fork the BAMS engine for a new domain (`docs/REFERENCE_STUDY.md`: reuse / adapt / drop); Excel **reader** + richer writer; internet gateway for drivers without opening the office PC; EN+AR with RTL; field data measured before designing | The method for studying a reference; Excel in/out for every app; a safe way to reach people outside the LAN (drivers, suppliers, sales reps). |
| **Self Business OS** (`Self-Business-App`) | Newest UI ideas: attention items, undo instead of "are you sure", safe import, error codes translated per language, screens that register themselves, per-PC document numbers, issued documents frozen as snapshots | The portal and every app's first screen; imports during onboarding (P6); money documents in Mizan. |
| **Earlier automation project** (`opening-nerp-tcode`) | Real behaviour of a large production MES observed at night, unattended; 89 gotchas; "verify the outcome of every step"; "stop at the first thing you do not recognise" | A real-world yardstick for our GMES screens and reports (what plant people actually query and export), and the strongest lesson set on **silent failure**. |

## 2. Ideas to adopt, mapped to the plan

Priority: **A** = before the first customer demo · **B** = with the phase named · **C** = later / optional.

| # | Idea | From | Where it goes in the package | Plan hook | Pri |
|---|---|---|---|---|---|
| 1 | **Attention items instead of dashboards**: each app returns items with reason, amount at risk, urgency, next action; the portal ranks them ("3 parked events", "lot waiting for inspection", "shift short of 4 people") | Self Business #6, BAMS 6.6 | Portal home + each app's first screen; one small `/api/attention` per app, read by the portal | WP-P2, S11 dashboard | A |
| 2 | **Import = read → report → decide → backup → save → undo** (only empty fields filled, batch id for one-click undo) | Self Business #16, BAMS 6.5 | Onboarding a real factory: items, BOMs, employees, opening stock from Excel | WP-P1/P3, Mizan & HR import screens | A |
| 3 | **Excel reader + writer without dependencies** (dates, formulas' cached values, tables, totals row) | Trip Orders `xlsx_read.py` / extended `xlsx.py` | HR (stdlib only) and any app that must accept the customer's own sheets | HR imports, scenario fixtures | B |
| 4 | **Error codes, texts by language** (`E:code\|English`, test compares codes with both dictionaries) | Self Business #15 | Parked-event reasons and ack codes shown to people in EN/AR in every app | 01-CONTRACTS (ack codes), WP-P2 | B |
| 5 | **Undo instead of "are you sure"** (undo is a new change, history stays honest) | Self Business #18, BAMS 4.1 | Non-financial actions in GMES/HR/3D screens. Never for posted money documents | eco-ui kit | C |
| 6 | **Per-PC document number series** (`INV-A-…`) and **issued documents are frozen snapshots, payments are events** | Self Business #2, #3 | Mizan if it ever runs on more than one PC; check against the ETA e-invoice numbering rule first | Mizan ADR, P7 | C |
| 7 | **Deterministic ids for automation results** (`hash(rule, trigger, index)`) | Self Business #4 | GMES planning: requisitions and crew requirements from an MRP run re-run on the same input must not duplicate | WP-G2 (MRP), WP-H1 | A |
| 8 | **Backups done right**: at start, every 6 h if changed, before import/restore, integrity check, second folder, restore = compensating change | BAMS 4.2 | One backup policy for all four apps, status shown in the portal | WP-X3 | B |
| 9 | **One installer that installs and updates; no readable source on the customer PC; data in `%ProgramData%`; releases built by GitHub Actions** | BAMS 5.1–5.3 | The package installer (today: `.bat` launchers from source) | P7 / release | B |
| 10 | **Upgrade in place, refuse a newer data folder, snapshot before migrating** | BAMS 1.5, 4.5 | Every app's data-version step (HR already has `DATA_VERSION`) | P7 | B |
| 11 | **Personal link instead of user name + password, never with admin rights; POST-login page defeats link previews** | BAMS 3.1, Trip Orders | Operators at stations (GMES), employees viewing their schedule (HR) | P4/P7 | C |
| 12 | **Internet mailbox for people outside the LAN** (gateway keeps cards keyed by token hash; office PC never reachable from the internet) | Trip Orders gateway | Suppliers confirming PO dates, drivers delivering goods, sales reps — later, optional | after P7 | C |
| 13 | **`wa.me` / `mailto:` as the first messaging connector** | Self Business #7 | Send a PO, a shipment notice, a shift change by WhatsApp without any subscription | Mizan/HR screens | C |
| 14 | **Browser app mode** (`msedge --app=http://127.0.0.1:<port>`) so each app opens as its own window | Self Business #10 | `start-all.ps1` / portal tiles | WP-P0 | A |
| 15 | **Mutation-check the tests that guard security** | Self Business #13, earlier automation project §21.1 | Already the rule in GMES and HR; extend to Mizan's eco module and the portal's pairing | WP-M3, WP-P1 | B |
| 16 | **Verify the outcome of every step; stop at the first unknown state; save evidence on failure** | earlier automation project CLAUDE.md §3.5, §3.9, §3.8 | Scenario engine and verifier: after each step read back and prove the result (right company, right date, right quantity); on failure keep the state and a report, never continue | WP-P3, WP-P4 | A |
| 17 | **Reconcile counts, never trust one number** (dataset held filler rows the grid hid; 288 rows of the wrong division) | earlier automation project §9 | Verifier checks quantities, values and headcount across the apps, not just "event delivered" | WP-P4 | A |
| 18 | **Measure the owner's real data before designing** (Trip Orders found 41 drivers not 42, 12 odometer back-steps) | Trip Orders REFERENCE_STUDY §7 | Before the first real customer: measure their Excel files and write the numbers as test fixtures | pre-install | B |
| 19 | **Reuse / adapt / drop table when borrowing an engine** | Trip Orders REFERENCE_STUDY §3–5 | Any time code or a pattern is taken from BAMS into the package | method | A |
| 20 | **Ideas book** (`IDEAS.md`: problem → idea → how → where → reuse) | BAMS, Self Business | `complete-company/IDEAS.md` for package-level ideas, bilingual | P8 docs | B |

## 3. What must NOT be copied

| Do not copy | Why |
|---|---|
| BAMS multi-PC replication (every PC holds all data, deterministic merge) into Mizan, GMES or HR | The package's rule is **one owner per truth + events**; GMES ADR-015 forbids merging production facts from several writers. BAMS solves a different problem (one app on many PCs). |
| "English only" (BAMS) | The package is EN + AR everywhere. |
| Self Business "no English words" chat rule into the product | That is a reply style for the owner, not a UI rule. |
| Anything from the earlier automation project code (`gmes_*.py`, CDP driving) into GMES | GMES CLAUDE.md: "Import code from the earlier automation project into the product" is forbidden. Take lessons, not code. |
| Company names, forms, real data from any reference | All repositories are public; synthetic data only. |
| Copyleft or source-available code found while studying | Self Business rule; check the licence first. |

## 4. How to use this file

- Before a work package, look for its plan hook in the table above and read the named card in the reference
  (`Mr.Ayman-HR/IDEAS.md`, `Self-Business-App/IDEAS.md`, `Yousef-Transportation/docs/REFERENCE_STUDY.md`,
  `opening-nerp-tcode/PROJECT_EXPERIENCE.md`).
- The references are read-only for this program. A fix needed in a reference is proposed there, in its own rules.
- Priority **A** items should be written into the plan files (`plan/50`, `plan/20`) at the next planning pass.
