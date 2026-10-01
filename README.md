# Complete Company

One package for a small or mid-sized factory, made of four applications that each work alone and work
better together:

| Application | Repository | What it owns | Port (real / demo) |
|---|---|---|---|
| **Mizan** | `coolman1984/Accounting-sys` | Company, accounts, items, warehouses, stock value, purchasing, costing | 4800 / 4810 |
| **GMES** | `coolman1984/GMES` | Work orders, production facts, quality, OEE, packing and shipping, plant model | 4700 / 4701 |
| **HR-System** | `coolman1984/HR-System` | People, organisation, shifts and schedule, attendance, skills | 8766 / 8790 |
| **Space Planner** | `coolman1984/3D-Modeling` | 2D/3D layout of halls, lines, warehouses | 4600 |

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
| `Start-Complete-Company.bat` | The four applications with their **real** data, each in its own window, and the portal at http://127.0.0.1:4500/ |
| `Start-Complete-Company-Demo.bat` | The **demonstration** copies (own data folders and ports), sign in everywhere with **admin / 123** |

An application that is already running is left alone. Closing an application's window stops only that
application. Needs Node.js 22.13+ (Mizan, GMES, Space Planner) and Python 3.10+ for HR-System from source
(the installed `HR-System.exe` is used when present).

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

## What is proven, and what is not (2026-09-30)

| Part of the master plan (`plan/`) | State |
|---|---|
| The chain Mizan ⇄ GMES ⇄ HR: S&OP and sales order → planning → purchase → receiving and inspection → serial production → packing and dispatch → WIP value, delivery, invoice, payment → staffing gap | Built; `pwsh -File scripts\Test-Pairing.ps1 -Chain` prints `CHAIN SCENARIO: PASSED` (about one minute, a fresh stack) |
| Cross-system verifier (`scenario/verify/verify.mjs`): company id, nothing parked, outboxes drained, quantities (GMES completed = Mizan received), work in progress, finished goods = Mizan stock, no negative stock, planning sources, no draft invoice left, trial balance, crew in HR, people mirror, overtime caps, service level against the book's range | Built; runs at the end of the chain and of every scenario run; `scripts\test.ps1` proves it fails when the applications disagree |
| Operations: each application makes and rehearses its own backup; the portal page has **Back up everything** | Built; the chain ends with it |
| Pairing wizard and portal | Built (`/pair`) |
| HR payroll calculation (WP-H6) | Not built: its gate is the owner's decision (`hr-system/docs/HR_PAYROLL_DESIGN.md` §2). The scenario books no payroll through HR; interim payroll is Mizan's own module |
| The 90-day Nile Vision scenario (WP-P3): `pwsh -File scripts\scenario.ps1 -Action build` (about 12 minutes; `mini` is part of `scripts\test.ps1`) | Built. The three applications are hosted in one process on one simulated clock (HR as its own process with `HR_SIMULATION=1`); every action goes through their HTTP APIs. Volumes are scaled (default 4 %); people, machines and lead times are the plant's own. The run records what HR refused, and what the verifier found, instead of hiding it |
| Portal **Scenario** tab (WP-P5) at `/scenario`: the last run's result, counters, people, days, log, the storyboard's arcs | Built (reads the last build; it never starts one) |
| Signed requests between the applications (WP-X2, second part): HMAC over method, path, body and time; five minutes; `ECO_REQUIRE_SIGNATURE=1` makes them mandatory | Built in Mizan, Itqan and HR with one shared test vector |
| Pinned TLS (WP-X2, first part) | Not built, **owner's decision needed**: Node and Python cannot make a certificate with their standard libraries, so either an `openssl` dependency or a small certificate tool is required (plan rule: no new dependency without written approval). Keys are already sealed at rest in all four applications (WP-X1) |
