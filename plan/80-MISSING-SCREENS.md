# 80 — The missing screens: inventory and execution plan

Version 1.0 · 2026-10-01. Written after film 4, where the customer's order had to be entered through Mizan's API because
Mizan has no order screen. Rule of this plan: **a capability the server has and no person can reach is not finished.**

## 1. How the inventory was made (repeatable)
- **Mizan:** server route groups (`apps/server/src/modules/*`) against the paths the web client calls through its `api`
  helper (`apps/web/src/**`, relative paths without `/api`). Server modules without a web module: `sales` (orders and what
  follows them) and `sop`.
- **Itqan (GMES):** route groups in `apps/mes-server/src/modules` against every path in `apps/mes-web/` (screens and
  `views.js`); then the first line of every screen file (its stated purpose).
- **HR-System:** routes in `hr_core/*.py` against `hr_core/web/app.js`, and the "Partially built" table of `STATUS.md`.
- **Space Planner:** the 🔨 items of plan 70.
- Integrity checks (`/verify`), pairing pumps (`/eco/push`, `/eco/sync`), machine feeds and the legacy attendance engine's own
  endpoints are **not** gaps: no person needs a screen for them (they are shown in SYS9100 / the health pages).

## 2. Inventory — what a person cannot do today

Priority: **A** = blocks the order-to-cash story or a film; **B** = a manager asks for it in the first week; **C** = nice to have.

| # | App | Missing screen | The server already has | Who needs it | P |
|---|---|---|---|---|---|
| M1 | Mizan | **Sales orders** (list, new order, confirm, lines with requested dates, status) | `/sales/orders` | sales | A |
| M2 | Mizan | **Available to promise** inside the order (can we deliver this quantity on this date?) and **reservations** | `/sales/atp`, `/sales/reservations` | sales | A |
| M3 | Mizan | **Deliveries** (from an order: pick, post the delivery note) | `/sales/deliveries` | store, sales | A |
| M4 | Mizan | **Invoice from deliveries** (one click from a posted delivery; today invoices are typed again) | `/sales/invoices` + deliveries | finance | A |
| M5 | Mizan | **Sales reports** (orders by customer/item/month, backlog, delivered vs ordered) | `/sales/reports` | management | B |
| M6 | Mizan | **Price check** inside the order line (which price list applied, and why) | `/sales/price` | sales | B |
| M7 | Mizan | **S&OP cycle** (demand versions, compare, approve; what manufacturing can supply) | `/sop/cycles`, `/sop/versions`, `/sop/approved`, `/sop/supply`, `/sales/supply-plan` | management, planning | B |
| M8 | Mizan | **Work in progress from the factory** (what Itqan reports as WIP, valued) | `/mfg/gmes-wip` | finance | B |
| G1 | Itqan | **Master production schedule** (what to make per product and week, firm/planned) | `/api/pln/mps` | planner | A |
| G2 | Itqan | **Shipping order from a sales order** (a button on SHP2020; today the shipping order is typed) | `/api/shipping-orders/from-sales-order` | shipping | A |
| G3 | Itqan | **Labour by line and close the day** (hours worked per line, close the labour day for HR) | `/api/labor`, `/labor/by-line`, `/labor/close-day` | supervisor | B |
| G4 | Itqan | **Planning settings** (which lines make which product, crew per station, planning horizon) | `/api/pln/item-lines`, `/pln/crew-settings`, `/pln/settings` | planner | B |
| G5 | Itqan | **Station requirements** (which skill a station needs; HR's phase 5 gate names it) | `PUT /api/stations/<code>/requirements` | engineering | B |
| G6 | Itqan | **Workforce status** (who is present on each line now, from HR) | `/api/workforce/status`, `/api/schedule` | supervisor | C |
| H1 | HR | **Labour evidence** (what manufacturing reported per person and day, beside attendance) | `/api/labour/evidence` | HR | B |
| H2 | HR | **Import shifts and rosters from Excel** (phase 3 gate) | engine exists, import missing | HR | B |
| H3 | HR | **Rejected rows and history** of uploads, in the new shell | `/api/rejected`, `/api/history` | HR | C |
| S1 | Space | **Item data link** for container planning (carton sizes and weights read from the items, not typed) | `plan_shipment`, `pack_container` | shipping | B |
| P1 | Agent | **Surprise reasoning** (a failed batch → available m², date, cost, options) | tools exist | management | B |
| P2 | Agent | **Month-end checklist** | Mizan reports exist | finance | B |
| P3 | Agent | **One-page management summary** in Arabic, each number linked to its source | — | management | B |

## 3. Execution plan — four waves, each one finished before the next

Every wave ends the same way: tests green in each repository, the screen in **English and Arabic**, a short film take that
uses the new screen instead of the API (the agent stage proves the screen works end to end), the repository's history and
status documents updated, a pull request.

| Wave | Content | Done means |
|---|---|---|
| **1 · Order to cash** | M1, M2, M3, M4 in Mizan; G2 in Itqan | A salesperson enters an order, sees the promise date, the store delivers, finance invoices from the delivery, shipping makes its order from the sales order — with no API call. Film 4's "order entered through the API" note is removed and the film re-shot. |
| **2 · Plan the month** | G1, G4 in Itqan; M7, M5 in Mizan | The S&OP meeting approves a demand version on screen, Itqan's MPS shows it, planning settings are editable, the sales report reconciles with the orders. |
| **3 · People on the line** | G3, G5, G6 in Itqan; H1, H2 in HR | A supervisor closes the labour day; HR sees it beside attendance; a station refuses an unqualified operator, configured on screen. |
| **4 · Management** | M8, M6, S1, P1, P2, P3 | Month-end checklist and one-page summary run from the agent; WIP value visible in Mizan; containers planned from item data. |

### How each screen is built (the same recipe everywhere)
1. Read the route's request/response schema and its tests; never change the server's behaviour to suit a screen.
2. Copy the closest existing screen of the same app (Mizan: `purchasing/requisitions`; Itqan: the TEMPLATE screens named in
   their first lines; HR: `registerScreen`). One clear action per screen.
3. Every text through the dictionaries in both languages; RTL by logical properties.
4. A browser test that does the job on screen and checks the result through the API.
5. Add the screen to the agent's skills (`agent/skills/*.mjs`) so the films and the demo use it.

## 4. Risks
- **Owner's PC may already hold some of these** (plan 70 §"🟡"): check before Wave 1 that nothing on his PC is unpushed, or
  we build twice.
- **Mizan ATP rules** (reservations vs. availability) must match what Itqan's planning assumes; Wave 1 includes a
  cross-check test in `scenario/`.
- Four repositories, four rule books: each pull request follows its own repository's definition of done.
