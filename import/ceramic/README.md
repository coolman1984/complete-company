# Ceramic company masters (Demo Ceramics Co., invented)

The same masters as the ceramic demo (`scenario/ceramic/run.mjs`), as the CSV files the importer takes: three parties, a
60x60 white porcelain tile (m2, lot-tracked) and four materials, the tile line L1 (press, dryer, glazing, kiln, sorting and
packing), the routing and the bill of materials per m2 (18 kg clay, 4 kg feldspar, 0.8 kg glaze, 0.7 carton). Drying and the
kiln are optional scan points; press, glazing and packing are mandatory.

    node import/import.mjs --folder import/ceramic                       # check only
    node import/import.mjs --folder import/ceramic --apply --mizan ... --gmes ...   # enter them

To start a real ceramic company, copy these five files, replace the rows with the real parties, items, stations and bills, and run
the same commands. `import/apply-smoke.mjs` proves this folder against the real applications (and that a second run creates nothing).
