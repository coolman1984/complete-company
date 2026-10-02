# Complete Company

One package for a small or mid-sized factory, made of four applications that each work alone and work
better together:

| Application | Repository | What it owns | Port (real / demo) |
|---|---|---|---|
| **Mizan** | `coolman1984/Accounting-sys` | Company, accounts, items, warehouses, stock value, purchasing, costing | 4800 / 4810 |
| **GMES** | `coolman1984/GMES` | Work orders, production facts, quality, OEE, packing and shipping, plant model | 4700 / 4701 |
| **HR-System** | `coolman1984/HR-System` | People, organisation, shifts, attendance, skills and payroll | 8766 / 8790 |
| **Space Planner** | `coolman1984/3D-Modeling` | 2D/3D layout of halls, lines, warehouses and loading | 4600 / 4601 |

This repository holds what belongs to the **package**, not to any one application:
the one-click launcher, the portal page, and the integration review and plan.
The integration design itself (who owns which truth, the event contracts, shared ids) lives in
`GMES/docs/ecosystem/` and `GMES/packages/eco-contracts`; see `ECOSYSTEM_INTEGRATION_REVIEW.md`.

## Folder layout

Clone the five repositories side by side:

```
Complete Company\
  complete-company\   <- this repository
  Accounting-sys\
  GMES\
  hr-system\
  3D-Modeling\
```

## Start

| Double-click | What starts |
|---|---|
| `Start-Integrated-Demo.bat` | **The applications connected**: Mizan, GMES and HR-System under one company, already paired, with the result of a whole business chain (S&OP + sales order → planning → purchase → receiving and inspection → serial production → packing and dispatch → delivery, invoice, payment → HR staffing gap). First run builds it (about two minutes). Sign in to every application with `admin / Demo-2026!`. Data: `..\_integrated-demo` |
| `Start-Ceramic-Demo.bat` | The same connected applications as a **ceramic-tile factory** (Demo Ceramics Co.): one distributor order of 1,440 m² from demand to cash — MRP, purchasing, a wrong-shade glaze lot stopped at incoming inspection, production by shade lot with losses by reason and a kiln stoppage, cost through WIP, delivery of one shade only, invoice, payment, staffing gap. Small data, first run about a minute. Presentation script: `scenario/ceramic/STORYBOARD.md`. Data: `..\_ceramic-demo`. Run one demo company at a time (same ports). |
| `Start-Ceramic-Showreel.bat` | **The showreel**: three months of Demo Ceramics Co. (1 Jul – 2 Oct 2026) played through Mizan, Itqan and HR-System, then the three applications opened with their own screens on that data (213 sales orders, 515 work orders, 170 employees, three pay runs booked by Mizan, all checks green). Sign in to every application with **admin / 123** (HR also `hr.officer / 123` calculates pay, `hr.approver / 123` approves it). Portal http://127.0.0.1:4501/, Mizan :4810, Itqan :4701, HR :8790. First run builds the data (about 4 minutes); `-Rebuild` plays it again. `node scenario\ceramic\showreel-check.mjs` proves the three agree; `node scenario\ceramic\ui-review.mjs` opens every screen in Chrome and reports any that fails. Data: `..\_ceramic-live`. |
| `Start-Complete-Company.bat` | The four applications with their **real** data, each in its own window, and the portal at http://127.0.0.1:4500/ |
| `Start-Complete-Company-Demo.bat` | The **demonstration** copies (own data folders and ports), portal at http://127.0.0.1:4501/. The three business apps use **admin / 123**; Space Planner runs locally without a sign-in. |

An application that is already running is left alone. Closing an application's window stops only that
application. Needs Node.js 22.13+ (Mizan, GMES, Space Planner) and Python 3.10+ for HR-System from source
(the installed `HR-System.exe` is used when present).

Real and demo portals validate their mode before reuse. Space Planner's demonstration keeps its projects in
`3D-Modeling/data-demo`. Package launchers open Google Chrome through the required Windows launcher helper;
`-NoBrowser` suppresses the portal opening and the planner launcher receives `--no-open`.

The portal shows one tile per application with a health light (it asks each application's public health
address every 5 seconds) and switches between English and Arabic.

## Rules of the package

- Each application owns its own database; nobody reads or writes another application's data.
- Master data flows only from its owner, as versioned events (`@eco/contracts`) over HTTP.
- Each application runs fully alone; integration is an add-on that can be switched off.
- User accounts stay per application (no shared sign-on for now).
- Tooling is PowerShell (`.ps1`) and `.bat` only.

## Check

```
pwsh -File scripts\test.ps1
```

checks `apps.json` (both languages, unique ports, real and demo never share a port), that every launcher it
names exists in the sibling folders, and that the portal answers.

The package regression suite also covers actual Mizan/Itqan/HR scenarios, payroll posting, repeat pairing,
party import identity/pagination, posted delivery-line invoice coverage, and readiness failures. The readiness
check includes Space Planner when its URL is supplied; `Check-Ready.ps1` supplies all four configured URLs.

## Recovery and backups

The portal's **Back up everything** asks all four configured applications to save and rehearse their own copy.
Missing business-app administrator credentials are a failed result. Space Planner uses its existing local
server protection and `/api/backups`, with snapshots in the selected data folder's `backups` directory.
Restore steps for planner projects, revisions, settings and agent history are in
`3D-Modeling/docs/decisions/0025-bounded-shipment-planning-and-demo.md`. Snapshots can contain credentials;
Windows-protected keys require re-entry when restoring under another Windows account or machine.

Pairing updates existing peer records, preserving delivery cursors. Each attempt uses unique package key names;
previous package keys are retired after a successful exchange. A failure lists the exact step; rerun after
repairing its cause. The wizard also checks HR's company identity and exchanges its people/schedule data.

For refused integration events, repair the reported prerequisite, then call
`POST /api/eco/peers/:id/retry-parked` in the sender with
`{"eventIds":["original-event-id"],"reason":"prerequisite repaired"}` using its normal administrator session.
Only events parked for that peer are eligible. The original envelopes and identities are retained;
recovery is audited and earlier facts for the same work order must succeed first. The verifier checks
unresolved refusals and sending cursors; a missing cursor cannot count as delivered.

The dated review and repair status are in the parent workspace's `PROJECT_REVIEW_2026-10-02.md` and
`PROJECT_FIX_STATUS_2026-10-02.md`.

## Files

| Path | What |
|---|---|
| `apps.json` | The one list of applications, folders, ports, launchers (read by the launcher and the portal) |
| `scripts/start-all.ps1` | Starts what is not running yet, then the portal |
| `scripts/apps.ps1` | Reads `apps.json`; port check |
| `scripts/test.ps1` | The checks above |
| `portal/server.mjs` | The portal (Node, no dependencies, 127.0.0.1 only) |
| `portal/index.html` | The portal page |
| `ECOSYSTEM_INTEGRATION_REVIEW.md` | The review of the four applications and the phased integration plan |

## What is proven, and what is not (2026-10-02)

| Part of the master plan (`plan/`) | State |
|---|---|
| The chain Mizan ⇄ GMES ⇄ HR: S&OP and sales order → planning → purchase → receiving and inspection → serial production → packing and dispatch → WIP value, delivery, invoice, payment → staffing gap | Built; `pwsh -File scripts\Test-Pairing.ps1 -Chain` prints `CHAIN SCENARIO: PASSED` (about one minute, a fresh stack) |
| Cross-system verifier (`scenario/verify/verify.mjs`): company id, nothing parked, outboxes drained, quantities (GMES completed = Mizan received), work in progress, finished goods = Mizan stock, no negative stock, planning sources, no draft invoice left, trial balance, crew in HR, people mirror, overtime caps, service level against the book's range | Built; runs at the end of the chain and of every scenario run; `scripts\test.ps1` proves it fails when the applications disagree |
| Operations: each application makes and rehearses its own backup; the portal page has **Back up everything** | Built; the chain ends with it |
| Pairing wizard and portal | Built (`/pair`) |
| HR payroll calculation (WP-H6) | Built on 2026-10-02 (owner's order: sample data, the trial runs on one laptop). HR keeps salary profiles in its own `payroll.db`, calculates a month (basic and allowances prorated, approved overtime, night allowance, unpaid leave and absence, social insurance, Egyptian salary tax, martyrs' fund), a second person approves exactly what the fingerprint shows, and HR sends totals per cost centre (no names) to Mizan, which books one balanced entry per cost centre. Proven by hand-computed tests in `hr-system/TEST_HR_PAYROLL.py` and by every scenario run, whose verifier compares Mizan's salary accounts with HR's approved runs to the piastre. Still owed before real salaries: a trial month checked by a payroll accountant (`hr-system/docs/HR_PAYROLL_DESIGN.md` §2). The pairing page makes the key in Mizan and sets HR's address and key (`PUT /api/payroll/target`) |
| The 90-day Nile Vision scenario (WP-P3): `pwsh -File scripts\scenario.ps1 -Action build` (about 12 minutes; `mini` is part of `scripts\test.ps1`) | Built. The three applications are hosted in one process on one simulated clock (HR as its own process with `HR_SIMULATION=1`); every action goes through their HTTP APIs. Volumes are scaled (default 4 %); people, machines and lead times are the plant's own. The run records what HR refused, and what the verifier found, instead of hiding it |
| Demo Ceramics Co., the sample company of the trial (no real data): `pwsh -File scripts\scenario.ps1 -Action ceramic` (about 3 minutes; `ceramic-mini` is part of `scripts\test.ps1`) | Built. Four tile products on two lines, ten materials, three suppliers, eight customers, about 176 people with sample salaries, three monthly pay runs; tiles are made and delivered by lot. See `scenario/ceramic/SAMPLE-DATA.md`; the importer's `import/ceramic` folder is generated from the same data (`scenario/ceramic/export-csv.mjs`) |
| Portal **Scenario** tab (WP-P5) at `/scenario`: the last run's result, counters, people, days, log, the storyboard's arcs | Built (reads the last build; it never starts one) |
| Signed requests between the applications (WP-X2, second part): HMAC over method, path, body and time; five minutes; `ECO_REQUIRE_SIGNATURE=1` makes them mandatory | Built in Mizan, Itqan and HR with one shared test vector |
| Master-data import (`import/`): a folder of CSV files (parties, items, plant, routings, bills of materials) is checked first (every problem with its file and line) and then entered in Mizan and Itqan through their own APIs; safe to run again | Built; `import/README.md`; proven by `import/masters.test.mjs` and a run against the real applications (`import/apply-smoke.mjs`), both in `scripts\test.ps1`. Not covered: opening stock and balances (Mizan's own import), people (HR's workbook import) |
| Readiness check (`scripts\Check-Ready.ps1`, `ready/`): is an installation ready for real data? applications answer, demonstration passwords refused, one company id, paired, nothing refused or waiting, optional rehearsed backups | Built and proven on a demonstration installation (not ready) and one with its own password (ready) |
| One packaged installer for the whole package, a clean-PC run, a run on a company LAN | **Not built / not done**: needs the build tools (Nuitka, Inno Setup) and a clean Windows machine; HR's own installer exists and still owes the clean-PC run |
| Space Planner shipments: pieces lie flat and stack, stated stack limits, complete sets of a model per container (decision 0024) | Built, hand-computed tests, browser tests green |
| Known limit of the ceramic run | The service level is not tuned: with glaze bought in lots of 1,000 to 2,000 kg and ten days of lead time, about a third of the ordered m² is still open at the end of the 95 days and most of what ships is late (the run reports it by days late); pay for attendance enters as monthly absence adjustments, because HR's attendance engine takes spreadsheets |
| Known limit of the scenario engine | It takes unscanned material when a unit starts, Itqan books it when the order completes, so late in a run the engine can see a shortage while Mizan still shows the stock; service-level ranges (50 %) are a first calibration, not a result || Pinned TLS (WP-X2, first part) | Not built, **owner's decision needed**: Node and Python cannot make a certificate with their standard libraries, so either an `openssl` dependency or a small certificate tool is required (plan rule: no new dependency without written approval). Keys are already sealed at rest in all four applications (WP-X1) |
