# Master-data import

Enter a company's masters from spreadsheets instead of by hand: **parties and items go to Mizan, the plant, routings and
bills of materials go to Itqan.** Save each sheet as CSV (Excel: *Save as > CSV*; commas or semicolons both work).

```
node import/import.mjs --folder <your folder>                 # CHECK ONLY: lists every problem with file and line, creates nothing
node import/import.mjs --folder <your folder> --apply `
     --mizan http://127.0.0.1:3000 --mizan-user admin --mizan-password ...  `
     --gmes  http://127.0.0.1:4100 --itqan-user admin --itqan-password ...
```

Passwords can come from `MIZAN_USER`, `MIZAN_PASSWORD`, `ITQAN_USER`, `ITQAN_PASSWORD` instead of the command line. Pair the
applications first (portal, `/pair`): Itqan receives the items from Mizan, it never creates them.

## The files (all optional; copy the examples in `templates/`)

| File | Columns (first row = names) |
|---|---|
| `parties.csv` | `kind` (supplier or customer), `code`, `name`, `payment_terms_days`, `credit_limit` |
| `items.csv` | `code`, `name_en`, `name_ar`, `type` (raw, semi, finished, packaging, service), `uom`, `tracking` (none, lot, serial), `procurement` (buy or make), `lead_time_days`, `moq`, `lot_rule` (lot_for_lot, fixed, multiple), `lot_size`, `safety_stock`, `supplier_code`, `purchase_price`, `sale_price`, `line` |
| `plant.csv` | `code`, `type` (plant, area, line, station, equipment), `parent`, `name`, `capacity_per_shift`, `crew`. A station is named `<line>-<operation>` |
| `routings.csv` | `item`, `seq`, `op`, `name`, `kind` (work, test, inspection, pack), `cycle_s`, `mandatory` (yes or no; empty = the first, the last and every operation that scans a part) |
| `boms.csv` | `item`, `component`, `qty_per`, `op` (the operation that uses it), `scan` (serial, lot, none) |

Defaults: a semi-finished or finished item is made and serial-tracked; everything else is bought and not tracked. Quantities have at most 3 decimals.
Prices are in the company's money (e.g. EGP), not in minor units.

## What it promises

- **Nothing is created if anything is wrong.** One list, every problem with its file and line (duplicate codes, unknown items or suppliers,
  a packing step that is not last, an operation with no station, a bill that contains itself, a quantity that cannot be exact...).
- **Safe to run again.** What is already there (by code or name) is skipped; the run says how many. Nothing is overwritten.
- Everything goes through the applications' own screens' API: no database is touched, so every rule of Mizan and Itqan still applies.
- Proven by `import/masters.test.mjs` (mistakes) and `import/apply-smoke.mjs` (the real applications, twice), both part of `scripts/test.ps1`.

Not imported here: opening stock and balances (Mizan's own opening-balance import), people (HR's own workbook import), customers' open
orders (they arrive as sales orders in Mizan).
