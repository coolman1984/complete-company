# 40 — Space Planner (repo `3D-Modeling`) work packages

Read first: `3D-Modeling/CLAUDE.md` (core invariants are binding), `docs/03-industrial-packs-plan.md`,
`docs/decisions/`. Done = `pnpm check` (typecheck + unit + browser tests) green; decision records at phase end.

## 0. Conventions and constraints

- `packages/core` stays **pure** (no Node, DOM, Date, random) and knows no activity: ecosystem data lives in
  `meta` (flat string/number/boolean map) or in `packages/starter` (production pack) and `apps/server` (I/O).
- Lengths are integer ticks (0.1 mm), angles integer millidegrees. Saves open forever: any new universal field is
  optional and stored only when set (`packages/core/test/saves/` stays byte-identical).
- The server accepts **loopback only** and rejects foreign Origins (`apps/server/src/http.ts`) — keep it. Outbound
  calls to GMES are allowed only on an explicit user command, from the server, with a stored key.
- No users/auth exist; the app is single-user on the planner's PC. Keys for GMES are stored in `settings` —
  protect them with the same DPAPI helper pattern (PowerShell `ProtectedData`) as the other apps (WP-X1).

## WP-S1 · Company and plant link — size M

1. Settings: `eco.company_id` (pasted from pairing), `eco.gmes_url`, `eco.gmes_key` (write-only in UI).
2. **Link to plant** panel (production and warehouse packs): source = file (JSON array of `eco.plant_node.v1`
   exported by GMES `GET /api/plant/export`) or "Fetch from GMES" (server-side GET with the key). Shows the GMES tree
   (plant → area → line → station → equipment); drag a node onto an item/zone or pick from a list to tag it:
   `meta["eco.ref"] = "plant_node:<uuid>"`, `meta["eco.code"] = <code>`, `meta["eco.type"] = <type>`.
   Tagging goes through a command (undoable), like every other change.
3. Production-pack rules (in `packages/starter`, each with a `RuleSource` "GMES link"): station of a linked line not
   placed (issue with count); item tagged with a node that no longer exists in the last imported tree (issue);
   two items tagged with the same station (issue); station without operating clearance (existing rule, now named
   with the GMES code).
4. Line view: stations of a line ordered by GMES routing op sequence when the codes follow `<line>-<op>`; flow path
   drawn with the existing routing in `packages/industry`.
5. Tests: tagging command + undo; rules; save round-trip with tags stays compatible; import of a malformed export
   refused with a clear message.

## WP-S2 · Layout snapshot to GMES — size S–M

1. Exporter (server side, `apps/server/src/eco/`): project revision → `eco.layout.snapshot.v1` (items with position,
   rotation, size in ticks, `eco_ref` from meta; zones with polygon and ref), envelope
   `source = eco://<company>/space/<node>`, id `UUIDv5(company, "space:layout:<project id>")`, `version` = project
   revision (monotonic). Validate against the vendored JSON Schemas (copy `eco.envelope.v1`, `eco.layout.snapshot.v1`
   and `eco.plant_node.v1` schema files byte-identical from GMES with a SHA-256 pin test) using a **minimal
   validator written in the repo** for the keywords those schemas use (type, properties, required, enum, pattern,
   minimum/maximum, minItems/maxItems, items, additionalProperties) — Space Planner has no zod and no dependency may
   be added (decided 2026-09-29; HR's `eco_contract.py` is the model).
2. "Send to GMES" button (POST to GMES inbox with the stored key) and "Download snapshot" (file).
3. Tests: exporter determinism, schema validity, revision → version, tags carried.

## WP-S3 · Live plant view — size M (needs GMES WP-G8)

A "Live" toggle in the 3D view of a linked project: the **browser** opens `EventSource(<gmes>/eco/v1/live?lines=…&k=
<read key>)`; tagged stations are coloured by `station.state` (running green, stopped red with reason tooltip,
held amber, starved grey); line output counters over each line zone. No data is stored; disconnect shows "last
update hh:mm". GMES must list the Space Planner origin in its CORS allow-list. Tests: a browser test with a fake SSE
server on loopback.

## WP-S4 · Nile Vision sample — size S (with WP-P3)

Add to `packages/starter` a sample company "Nile Vision Electronics" (projects: site plan of EG-NV1, FA hall with
FA-1 and FA-2 lines and stations placed at real sizes, SMT hall, warehouse with RM racks + FG pallet zone + QA-HOLD
quarantine cage, canteen for the C-shift headcount) built from `complete-company/scenario/book.json` station list
(codes); items carry `eco.code` so the link panel can resolve ids after pairing automatically ("auto-link by
code"). Tests: sample opens, checks run, every FA station of the book is placed exactly once.

## Phase-end docs (WP-D)

Decision records in `docs/decisions/` (GMES link and eco.ref in meta; snapshot contract and units; live view from
the browser only), README status table, `docs/agents.md` if tools were added.
