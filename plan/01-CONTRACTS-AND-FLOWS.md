# 01 — Contracts and flows

Single source: `GMES/packages/eco-contracts/src/*.ts` (zod 4.6.5) → `npm run schemas -w packages/eco-contracts`
→ `schemas/*.schema.json`. Copies: Mizan `apps/server/src/eco-contracts/` (byte-identical `src/` + pin test),
HR `eco_schemas/` (byte-identical schemas + stdlib validator `eco_contract.py`), Space Planner (only what it uses).

## 1. Link topology (decided)

Every application has the same three parts (GMES has them; Mizan gets them in WP-M2; HR gets an inbox in WP-H1;
Space Planner gets a minimal pusher in WP-S2):

1. **Outbox** — `eco_outbox(seq INTEGER PRIMARY KEY, id, type, subject, correlation, causation, time, data)`,
   written in the same transaction as the business change, UPDATE/DELETE blocked by triggers, `seq` gap-free.
2. **Inbox** — `POST /eco/v1/inbox {events:[…]}` (≤ 500), scope `eco.inbox.write`, dedupe on `(source, id)`,
   one transaction per event, per-event result `applied | unchanged | stale | duplicate | rejected` (+ `code`,
   `message`). Rejects another company's `source` (`eco.foreign_company`) and types it does not accept
   (`eco.not_accepted`).
3. **Pusher** — for each configured **peer** `{name, url, key, types[]}`: read own outbox after the peer's cursor,
   filter by `types`, POST batches of ≤ 200 to the peer's inbox, advance the cursor past events answered
   `applied|unchanged|stale|duplicate`, record `rejected` ones as parked (visible in `/api/integration/events`,
   retried when the event is re-staged with a newer version). 5xx / 429 / network error → stop the cycle, keep
   the cursor, retry next cycle (interval default 10 s, backoff to 60 s). Cursor per peer stored in `eco_peer`.
   `GET /eco/v1/feed` stays for diagnostics, the portal, and pull consumers (legacy link-mizan).

| From → To | Types pushed | Built by |
|---|---|---|
| Mizan → GMES | `eco.item.v1`, `eco.warehouse.v1`, `eco.party.v1`, `acc.stock_position.v1`, `acc.sales_order.v1`, `acc.demand_plan.v1`, `acc.purchase_order.v1`, `acc.goods_receipt.v1` | WP-M2 (pusher, publishers of item/warehouse/party/stock/PO), WP-M1+M3 (SO, demand plan), WP-M3 (GR) |
| GMES → Mizan | `mes.purchase_requisition.v1`, `mes.supply_plan.v1`, `mes.lot_decision.v1`, `mes.material.consumed.v1`, `mes.production.completed.v1`, `mes.production.scrapped.v1`, `mes.work_order.closed.v1`, `mes.shipment.dispatched.v1` | WP-G2/G4/G5 (publishers), WP-G7 (pusher in GMES), WP-M3/M4 (consumers in Mizan) |
| GMES → HR | `mes.crew_requirement.v1`, `mes.labor_day.v1` | WP-G2, WP-G6 (publishers), WP-H1 (HR inbox) |
| HR → GMES | `eco.employee.v1`, `eco.attendance_day.v1`, `eco.schedule_day.v1`, `eco.qualification.v1` | built (HR `eco_link.py` → GMES inbox) |
| HR → Mizan | `hr.payroll_period.v1` | WP-H6 (publisher), WP-M5 (consumer) |
| GMES → Space Planner | `eco.plant_node.v1` (file or fetch) | WP-G8, WP-S1 |
| Space Planner → GMES | `eco.layout.snapshot.v1` (file or push) | WP-S2, WP-G8 |

`link-mizan` (GMES `apps/link-mizan`) keeps working until WP-M4 makes Mizan consume the four production facts
natively; WP-G7 then retires it (kept for one release behind a switch).

## 2. Contract catalogue

Status: **built** = in `@eco/contracts` and used · **defined** = in `plan.ts` (2026-09-29), not used yet ·
**to add** = specified here, add in WP-C1.

| Type | Status | Producer (trigger) | Consumer (action) |
|---|---|---|---|
| `eco.envelope.v1`, `eco.ack.v1` | built | — | — |
| `eco.item.v1` | built | Mizan (item saved) | GMES mirror `mdm_item` |
| `eco.warehouse.v1` | built | Mizan (warehouse saved) | GMES mirror |
| `eco.employee.v1`, `eco.attendance_day.v1`, `eco.schedule_day.v1`, `eco.qualification.v1` | built | HR | GMES mirrors |
| `mes.material.consumed.v1`, `mes.production.completed.v1`, `mes.production.scrapped.v1`, `mes.work_order.closed.v1` | built | GMES ledger facts | link-mizan → Mizan (later Mizan native, WP-M4) |
| `mes.shipment.dispatched.v1` | built, extended 2026-09-29 (`shipment.customer_party?`, `lines[].sales_order?`) | GMES container sealed | Mizan: delivery + invoice draft (WP-M3) |
| `eco.party.v1` | defined | Mizan (party saved) | GMES mirror `mdm_party` (WP-G1) |
| `acc.sales_order.v1` | defined | Mizan (SO confirmed / changed / delivered / closed) | GMES mirror (WP-G1) → MPS demand (WP-G2), shipping orders (WP-G5) |
| `acc.demand_plan.v1` | defined | Mizan (plan approved / superseded) | GMES mirror → MPS forecast demand (WP-G2) |
| `acc.stock_position.v1` | defined | Mizan (after any stock movement of the item×warehouse; debounced per transaction) | GMES mirror → MRP on-hand (WP-G2) |
| `acc.purchase_order.v1` | defined | Mizan (PO approved / received / closed) | GMES mirror → MRP scheduled receipts (WP-G2) |
| `mes.purchase_requisition.v1` | defined | GMES MRP run (new / changed / cancelled requirement) | Mizan requisition upsert (WP-M2) |
| `mes.supply_plan.v1` | defined | GMES MRP run | Mizan S&OP supply table (WP-M2 store, WP-M1/M3 show) |
| `mes.crew_requirement.v1` | defined | GMES MRP/MPS run (per line × shift × day) | HR staffing gap (WP-H1) |
| `acc.goods_receipt.v1` | to add | Mizan (goods receipt posted) | GMES material lots pending IQC (WP-G4) |
| `mes.lot_decision.v1` | to add | GMES (IQC accept / reject / partial; hold / release of a lot) | Mizan stock status + supplier return / claim (WP-M3) |
| `mes.labor_day.v1` | to add | GMES (per person × production day: minutes booked per line/station, from facts + attendance) | HR overtime evidence and payroll input (WP-H3, WP-H6) |
| `hr.payroll_period.v1` | to add | HR (period approved) | Mizan journal per cost centre (WP-M5) |
| `eco.plant_node.v1` | to add | GMES (plant node saved) | Space Planner link panel (WP-S1) |
| `eco.layout.snapshot.v1` | to add | Space Planner (user exports / sends) | GMES `spatial_ref` on plant nodes (WP-G8) |
| `eco.item.v1` planning extension | to add (additive) | Mizan | GMES MRP parameters |
| `eco.schedule_day.v1` field `line?: zCode` | to add (additive) | HR (work centre of the assignment/day) | GMES crew coverage per line (WP-G2 PLN2070) |

### 2.1 Contracts to add in WP-C1 (put them in `plan.ts` unless noted; same style as the existing ones)

```ts
// eco.item.v1 — ADDITIVE optional block (master.ts). Mizan fills it from the item planning fields (WP-M2).
planning?: {
  material_type: 'raw' | 'semi' | 'finished' | 'packaging' | 'service',
  procurement: 'buy' | 'make',
  lead_time_days: number,            // int ≥ 0, planned delivery time for buy items
  moq: zDecimal,                     // "0" = none
  lot_rule: 'lot_for_lot' | 'fixed' | 'multiple',
  lot_size: zDecimal,                // for fixed / multiple
  safety_stock: zDecimal,
  default_supplier?: zRef,
  expedite_lead_time_days?: number,  // int; air-freight alternative used by MRP exceptions
}

// eco.schedule_day.v1 — ADDITIVE optional field (master.ts):
line?: zCode,                        // the GMES line (HR work centre) the person works on that day

// acc.goods_receipt.v1 — a posted goods receipt (Mizan). Identity mizanId('goods_receipt', id).
{ id, code, version, origin,
  purchase_order?: zRef, supplier: zRef, receipt_date: zDate, warehouse: zRef,
  status: 'posted' | 'voided',
  lines: [{ line_no, item: zRef, qty: zPositiveDecimal, uom: zCode,
            lot_no?: string(1..64), supplier_lot?: string(1..64), expiry?: zDate,
            po_line_no?: int }] (1..500) }

// mes.lot_decision.v1 — GMES quality decision on a received material lot. Identity UUIDv7 per decision.
{ id, code, version, origin,
  item: zRef, lot_no: string, goods_receipt?: zRef, supplier?: zRef,
  decision: 'accepted' | 'rejected' | 'partially_accepted' | 'on_hold' | 'released',
  accepted_qty: zDecimal, rejected_qty: zDecimal, uom: zCode,
  inspection?: { plan_code: zCode, aql: string, sample_size: int, defects: int },
  defect_codes: zCode[] (≤ 50), decided_at: zTime, decided_by: zPerformedBy }

// mes.labor_day.v1 — minutes a person worked in production on one production day (snapshot; id = UUIDv5(company,
// "gmes:labor:<employee code>:<date>")). Derived from facts (person on scans/bookings) bounded by attendance.
{ id, version, origin, employee: zRef, production_date: zDate, shift?: zCode,
  entries: [{ line: zCode, station?: zCode, minutes: int ≥ 0 }] (≤ 50), total_minutes: int }

// hr.payroll_period.v1 — HR's approved payroll period, totals only, no names (docs/HR_PAYROLL_DESIGN.md).
// Identity UUIDv5(company, "hr:payroll_period:<period>:<run>").
{ id, code, version, origin, period: zPeriod, run: int ≥ 1, currency: 'EGP',
  pay_date: zDate, status: 'approved' | 'reversed',
  lines: [{ cost_center: zCode, account_key: 'gross_earnings' | 'overtime' | 'night_allowance' | 'employer_social_insurance'
            | 'employee_social_insurance' | 'salary_tax' | 'other_deductions' | 'net_payable' | 'agency_labour',
            amount_minor: int }] (1..2000),   // integer piastres; debit keys positive, credit keys positive, the
                                              // consumer maps keys to accounts; totals must balance per the rule in WP-M5
  headcount: int, hours: { regular: int, overtime_day: int, overtime_night: int } }
// NOTE: money in this contract is allowed: HR and Mizan both handle money; GMES must NEVER accept this type.

// eco.plant_node.v1 — GMES plant model node (master snapshot). Identity: GMES UUIDv7 of the node.
{ id, code, version, origin, name: zName, type: 'plant' | 'area' | 'line' | 'station' | 'equipment',
  parent?: zRef, active: boolean, capacity_per_shift?: int, crew?: int }

// eco.layout.snapshot.v1 — a Space Planner project revision (master snapshot of the layout).
// Identity UUIDv5(company, "space:layout:<project id>").
{ id, code, version, origin, name: string, revision: int, site?: zRef,
  length_unit: '0.1mm',              // Space Planner's storage tick; integers, never rounded
  items: [{ item_id: string, name: string, category: string,
            x: int, y: int, rotation_mdeg: int, w: int, d: int, h: int,
            eco_ref?: { type: 'plant_node' | 'warehouse' | 'storage_location', id: zUuid, code: zCode } }] (≤ 20000),
  zones: [{ id: string, kind: string, polygon: [int, int][] , eco_ref?: {...} }] (≤ 2000) }
```

Register every new type in `CONTRACTS` (`index.ts`), add id helpers in `ids.ts` if needed
(`spaceId(company, type, key)`), regenerate schemas, add contract tests (valid + invalid samples per type),
then refresh copies (Mizan pin, HR `eco_schemas/` + extend `eco_contract.py` if it needs new keywords).

## 3. Flow specifications (what each side does, exactly)

### F1 Sales order → planning
- Mizan publishes `acc.sales_order.v1` on: confirm, any line change, delivery posting (updates `delivered_qty`),
  close, cancel. Draft orders are never published. `version` = monotonic per SO.
- GMES applies to `mdm_sales_order` + `mdm_sales_order_line` (replace lines on newer version). A `cancelled` or
  `closed` SO stops generating demand. Unknown item → park `mdm.unknown_item` (retry on next version or after the
  item mirror catches up — GMES retries parked events of a correlation when the blocking master arrives).

### F2 Demand plan (S&OP) → MPS
- Mizan publishes `acc.demand_plan.v1` on approve (status `approved`) and when superseded (status `superseded`).
- GMES keeps all plans; MPS uses the latest `approved` plan per item×period for the part of each month not covered
  by firm sales orders (**forecast consumption**: backward 0 / forward 30 days within the month — firm orders
  consume forecast of the same month; demand = max(forecast − consumed, 0) + orders).

### F3 Stock and supply → MRP
- `acc.stock_position.v1`: Mizan publishes after every committed stock movement touching item×warehouse (one
  snapshot per pair per transaction; `reserved` from the sales module's registry). GMES uses
  `on_hand − reserved` of the planning warehouses (config: which warehouses are "plant stock").
- `acc.purchase_order.v1`: open quantity per line (`qty − received_qty`) on `expected_date` is a scheduled receipt.

### F4 MRP outputs
- `mes.purchase_requisition.v1`: one per (item, need date bucket) per MRP run, `code` = `PR-<run>-<n>`; stable id per
  (item, need week) so a later run **updates** instead of duplicating; a requirement that disappears is published
  `status: cancelled`. Mizan upserts unless already converted; after conversion, changes create a *reschedule
  message* in Mizan (warning on the PO line), never an automatic PO change.
- `mes.supply_plan.v1`: one per run with all item×period lines; Mizan replaces its `eco_supply_plan` view for the
  S&OP comparison.
- `mes.crew_requirement.v1`: one per line × shift × work date in the MPS horizon (default 28 days); headcount 0 when
  a previously needed shift is no longer needed.

### F5 Purchasing → receipt → inspection
- Mizan converts requisitions to POs (same supplier), publishes `acc.purchase_order.v1` (with `requisition` ref per
  line). On goods receipt post, publishes `acc.goods_receipt.v1` with lots.
- GMES creates `trk_material_lot` rows (status `pending_iqc` if an IQC plan exists for the item, else `accepted`),
  runs IQC (existing `qms` inspection, stage `iqc`, target lot), publishes `mes.lot_decision.v1`.
- Mizan on `rejected` / `on_hold`: moves the lot quantity to a *blocked* status (new stock status or quarantine
  warehouse — WP-M3 decides: **quarantine warehouse `QA-HOLD` per plant**, transfer posted automatically, reference
  `eco:<event id>`), creates a draft purchase return / debit note for rejected qty; on `released`/`accepted` moves
  it back / leaves it.

### F6 Production → value
- Unchanged until WP-M4: link-mizan pulls GMES feed and posts adjustments against WIP (ADR-019).
- WP-M4: Mizan consumes the four facts natively: new stock document kinds `production_issue` (to WIP) and
  `production_receipt` (from WIP at the order's WIP value, final completion takes the remainder), `work_order.closed`
  → variance journal; same idempotency reference `eco:<event id>`; link-mizan switched off.

### F7 Ship → deliver → bill → collect
- GMES shipping orders are created **from mirrored SO lines** (WP-G5); the dispatched event carries
  `customer_party` and `lines[].sales_order{id, code, line_no}`.
- Mizan on `mes.shipment.dispatched.v1`: for each line with `sales_order`, post a **delivery** (goods issue) for
  that SO line and qty, dated `dispatched_at` (plant local date), reference `eco:<event id>:<line index>`; then
  create a **draft invoice** from the delivery (the billing clerk posts it; ETA queue on post). Lines without
  `sales_order` → park `sales.no_order` (a shipment must come from an order in the integrated package).
  Over-delivery beyond open SO qty → park `sales.over_delivery`.
- Mizan publishes the SO snapshot again (new `delivered_qty`), which closes the loop in GMES.

### F8 People
- GMES `mes.crew_requirement.v1` → HR computes the **staffing gap** per line × shift × day (required vs people
  scheduled with the required qualifications) → HR planners act (assign, overtime, hire). HR's answer reaches GMES
  as the existing schedule/qualification snapshots. GMES shows "crew coverage" per line/shift (WP-G2 screen).
- GMES `mes.labor_day.v1` → HR compares with attendance (overtime evidence, labour hours per cost centre).
- HR `hr.payroll_period.v1` → Mizan books one journal per period and cost centre (WP-M5), then pays via the bank.

### F9 Layout
- GMES exports plant nodes (`eco.plant_node.v1` array file or `GET /api/plant` with an eco key) → Space Planner
  "Link to plant" panel tags items and zones with `eco_ref`.
- Space Planner exports `eco.layout.snapshot.v1` (file download, or push to GMES inbox from its server on user
  command with a stored key) → GMES stores `spatial_ref {layout_id, item_id, x, y}` per plant node and shows it.
- Live view: the Space Planner **browser page** opens GMES SSE `GET /eco/v1/live?lines=` (WP-G8) with a read key and
  colours tagged stations by state (running / stopped / held / starved).

## 4. Error codes (shared vocabulary; use exactly these)

| Code | Meaning |
|---|---|
| `eco.foreign_company` | Envelope source belongs to another company |
| `eco.not_accepted` | This consumer does not accept this type |
| `eco.contract_violation` | Data fails the contract |
| `mdm.wrong_owner` | Snapshot from an app that is not the configured owner |
| `mdm.not_mirror` | This install is the fallback owner; it refuses snapshots |
| `mdm.unknown_item` / `mdm.unknown_party` / `mdm.unknown_warehouse` | Referenced master not mirrored yet (retry) |
| `sales.no_order`, `sales.over_delivery`, `sales.order_closed` | Shipment cannot be delivered against an order |
| `stock.insufficient` | Existing Mizan refusal |
| `purchasing.already_converted` | Requisition changed after conversion (reschedule message created) |
| `payroll.unbalanced`, `payroll.unknown_cost_center` | Payroll period cannot be booked |
| `eco.held_behind` | Earlier event of the same correlation is parked |
