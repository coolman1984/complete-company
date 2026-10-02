# Ceramic company masters (Demo Ceramics Co., invented)

The masters of the scenario engine's ceramic company (`scenario/gen/ceramic.mjs`), written as the CSV files the importer takes
(`node scenario/ceramic/export-csv.mjs` regenerates them, so the sample folder and the engine's company are one data set):
three suppliers and eight distributors and developers, ten raw materials and four tile products (60x60 white and grey porcelain,
30x60 beige wall tile, 20x90 wood-look plank; m2, lot-tracked), two tile lines (L1, L2) with press, dryer, glazing, kiln and sorting
and packing stations, and a routing and a bill of materials per m2 for each product (white 60x60: 18 kg clay, 4 kg feldspar,
2 kg kaolin, 0.8 kg glaze, 0.7 carton). Drying and the kiln are optional scan points; press, glazing and packing are mandatory.
Every name and price is sample data.

    node import/import.mjs --folder import/ceramic                       # check only
    node import/import.mjs --folder import/ceramic --apply --mizan ... --gmes ...   # enter them

To start a real ceramic company, copy these five files, replace the rows with the real parties, items, stations and bills, and run
the same commands. `import/apply-smoke.mjs` proves this folder against the real applications (and that a second run creates nothing).
People and salaries are not part of the importer: HR-System keeps them (the engine's ceramic people are `scenario/gen/ceramic.mjs`).
