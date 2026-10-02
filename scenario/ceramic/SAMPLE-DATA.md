# Demo Ceramics Co. — the sample company the trial runs on

The owner's order of 2026-10-02: the trial on this laptop uses **no real data**, only a logical, rich, invented company. This is that
company: **Demo Ceramics Co.** (code `DCER`), a tile factory. Every name, price, wage and quantity is made up, deterministic (same seed,
same data) and written down in one file, `scenario/gen/ceramic.mjs`. The Space Planner keeps its own "Samsung Egypt" sample projects,
untouched.

## What is in it

| Part | Sample data |
|---|---|
| Products (m², lot-tracked, made) | 60x60 porcelain white (320 EGP) and grey (335), 30x60 glossy wall tile beige (255), 20x90 wood-look plank oak (380) |
| Materials (10) | red clay, feldspar, kaolin, three glazes, oak digital ink, three cartons |
| Suppliers (3) | Aswan Clay & Minerals (net 30), Frit & Glaze Supplies (net 45), Delta Carton Works (net 15) |
| Customers (8) | distributors, home centres, contractors and a project developer, with terms of 15 to 60 days, credit limits and their own payment delays |
| Plant | two lines (L1 floor porcelain, L2 wall tiles and planks), each with press, dryer, glazing, kiln, sorting and packing stations; shifts A, B and night C; a Friday rest and public holidays |
| Demand | a monthly plan approved on the first working day (three months ahead, with seasonality) and about 215 orders over the window, plus a project order (Red Sea Developments, three products, delivery in three weeks) |
| Production | released from planning, run in daily batches: material taken by lot (oldest first), good m² reported as one lot per day and product, losses by reason (kiln crack, press lamination, downgrade) at 3.5 to 5.5 % |
| Quality | incoming inspection of clay, kaolin, glazes and ink: a few lots are partly or wholly rejected by a fixed rule per lot |
| People (about 176) | 17 departments and sections with cost centres, 40 jobs, grades G1 to G8, salaries per grade (sample), qualifications with expiry, leave, absences, two operator leavers a month replaced two weeks later (requisition, candidate stages, hire, induction), overtime asked the day before and approved by someone else |
| Pay | a salary profile per person (basic 65 %, allowances 35 %, insurable wage between 2,700 and 16,700), unexcused absence as monthly adjustments, three monthly pay runs (July, August, September): HR calculates, a second person approves, HR sends totals per cost centre to Mizan, which books one balanced entry per cost centre |

## How to run it

    pwsh -File scripts\scenario.ps1 -Action ceramic        # 95 days, written to scenario\out\demo-ceramics\
    pwsh -File scripts\scenario.ps1 -Action ceramic-mini   # 15 days across a month end, one product (part of scripts\test.ps1)
    node scenario\ceramic\export-csv.mjs                   # the masters as the importer's CSV files (import\ceramic)

The run ends with the cross-system verifier, which also compares Mizan's salary accounts with HR's approved pay runs to the piastre.
The older one-order pitch demo (`scenario/ceramic/run.mjs`, `Start-Ceramic-Demo.bat`) is unchanged.
