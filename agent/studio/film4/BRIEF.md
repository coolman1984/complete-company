# Film 4 — from the customer's order to the purchase order

Written before building, as the film studio's craft notes ask (`../CRAFT.md`). Concept film: the company is invented.

## Brief
- **Business and buyer:** the demo ceramic-tile company («شركة السيراميك التجريبية»); the viewer is a board of a real tile factory.
- **The viewer's problem:** an order arrives and someone re-types it, counts raw materials by hand, then chases purchasing.
- **The single action (CTA):** "try it on one of your own orders" (a pilot on the factory's data).
- **Provably true (every line is read back through the applications' APIs before the take ends):** the order reaches the
  factory by itself; planning asks for exactly clay 25,920 kg, feldspar 5,760 kg, glaze 1,152 kg, cartons 1,008 (the order's
  1,440 m² × the bill of materials); two purchase orders are made from the four requisitions and approved; the received
  lots appear in the factory's incoming-lots screen.
- **Staged, and said so in the film's notes:** the order is entered in Mizan through its order API (Mizan has no order
  screen yet); the goods receipt is recorded through Mizan's receipt API; the clock is a studio clock.
- **Never claimed:** savings, time saved, customers, results. No real company, name or price.
- **Length:** about 2 minutes, 1920×1080, 30 fps (a screen film, not a 30 s ad: each screen needs a readable hold).
- **Brand:** the studio's dark stage with the real (light) application windows; clay orange `#D8733F`, teal `#3B8FB0`, Plex Sans Arabic.

## Mechanism choices (from the kit's grammar)
- **One persistent actor:** the distributor's order. A card in the side panel carries it through every scene; its chips fill
  in order (arrived → planned → purchase orders → materials in) — "materialising results", cause → effect, one thread.
- **Foreground becomes the transition:** the chapter title leaves before the next window arrives; no black gap, no 3-second
  title slide (the earlier films had one per scene).
- **Frame 0 is a finished composition;** no fade from black.
- **Camera:** still and wide (owner's notes on film 2); a 3 % push over each hold keeps the frame alive; no chasing the cursor.
- **Density by hierarchy:** one screen at a time, one thing to read, the agent's cursor and ring show where.

## Storyboard

| Time | What the viewer sees | Business job | Out (what survives) |
|---|---|---|---|
| 0–3.6 | Title, finished at frame 0: "الوكيل الذكي — من طلب العميل لحد أمر الشراء" | Say what the film is | the order card enters the panel |
| 02 Order | Itqan's sales-orders screen, empty; the distributor's order arrives; the row appears, its line opens (1,440 m²) | Nobody re-types the order | the order card, state "وصل المصنع" |
| 03 Planning | MRP runs (a new run row: 1 planned order, 4 requisitions); the planned tile order; the 4 requisitions with quantities and dates | The factory knows what to buy and when | the 4 requisitions → Mizan |
| 04 Purchasing | Mizan's requisitions (same 4, with suppliers); two ticked, "convert", the draft order, approve; again for the other supplier; the orders list | Purchasing decides, the system prepares | the 2 purchase orders → suppliers |
| 05 Receiving | Itqan's incoming lots: the 4 lots arrive, waiting for inspection | The loop closes in the factory | end card |
| End | The chain with the finished steps; the next action | CTA on mute: "جرّب على طلب من مصنعك" | — |

## Storyboard check (self-review; an independent critic is still owed, see the ledger)
- Chronology matches the real service: order → MRP → requisitions → PO → receipt. ✔ (it is the product's own flow)
- Every number is exact and read back. ✔
- Distinct compositions: plain table (orders), run list + planned-order table + requisition table, three Mizan screens (grid, dialog, form), lots table. Four of five are tables: the weakest point of a screen demo; the thread card, the stamps and the chips carry the variety.
