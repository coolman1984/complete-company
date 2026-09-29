# TV Industry Reference - LED/QLED TV Assembly Plant in Egypt

Reference data for the end-to-end sample company **"Nile Vision Electronics S.A.E."** (invented; 10th of Ramadan City, Sharqia). It is used to seed four integrated systems: Mizan (ERP/accounting), GMES (MES), HR and the 3D layout.

- Research date: 2026-09-29. Prices and rates are as of Aug/Sep 2026 unless stated otherwise.
- Every number is tagged. **[S#]** means a cited source (list at the end). **[E]** means an engineering or industry estimate: my own calculation or common practice, with no public source found. Check [E] values with a practitioner if they matter for the demo.
- Currency: USD for imported materials and exports, EGP for local costs and domestic sales.

---

## 0. Key corrections to common assumptions

| Assumption | What the data says | Source |
|---|---|---|
| "Panel = 60-70% of BOM" | TrendForce puts display panels at **about 40-50% of total TV manufacturing cost** (Jan 2026). 60-70% holds only if "panel" means the full **module** (open cell + backlight + optical films), and mostly for 65" and larger. For a 55" UHD, the open cell alone is about 55% of material cost and about 48% of total unit cost. | [S7] + [E] |
| "Memory is negligible" | In 2026, DRAM rose from **2.5-3% to 6-7% of TV BOM**. 4 GB DDR4 contract prices more than quadrupled in one year. | [S7] |
| "Import under LC is mandatory in Egypt" | The mandatory-LC rule (Feb 2022) was **cancelled on 29 Dec 2022**. Documentary collection (CAD) is allowed again. | [S24] |
| "Social insurance 11% / 18.75%" | **Confirmed.** Employee 11%, employer 18.75% of the insurable wage. 2026 insurable wage: min **EGP 2,700**, max **EGP 16,700** per month. | [S3][S4] |
| "Overtime per old Law 12/2003" | New **Labour Law 14/2025** has been in force since **1 Sep 2025**. OT premium is at least **35% (day)** and **70% (night)**. Annual raise is at least **3% of insurable wage**. | [S5][S6] |
| "Clearance takes weeks" | Average sea-freight customs release was **5.6 days in early 2025** (it was over 28 days before). **ACID via Nafeza** is mandatory. | [S15][S14] |

---

## 1. Process flow, cycle times, staffing, OEE / yields

### 1.1 Plant process map (open-cell based, "OC-to-set" integrated line)

```
IMPORT (open cell + T-CON, SoC/memory, LED bars, films, chassis steel, resin)
  -> IQC (AQL sampling, panel lighting test on sample)
  -> SMT (main board PBA; SMT side of power board) -> AOI -> THT/wave/selective (power board) -> ICT/FCT
  -> Injection molding (back cover, stand, small parts) -> visual/dimensional check
  -> Kitting / line-side supermarket
  -> FINAL ASSEMBLY LINE: BLU build -> OC mounting (clean booth) -> PBA/PSU/speakers -> back cover
     -> SW download + keys -> aging -> white balance -> function test -> hi-pot -> visual
     -> accessories -> packing -> weighing -> palletizing
  -> OQC (ISO 2859-1 sampling) -> FG warehouse -> container stuffing / domestic trucks
```

### 1.2 Final assembly line, stations in order (typical 55" line) [E, from industry practice; aging and inspection references S16]

| # | Station | Content | Typical time / note |
|---|---|---|---|
| 1 | Chassis loading | Bottom chassis (galvanized steel) onto pallet/jig; ID label (2D code = MES serial) | 1 op |
| 2 | LED bar mounting | Tape/screw LED bars, connect harness, lens check | 2-3 ops |
| 3 | Reflector sheet | Place reflector, fix with pins/tape | 1 op |
| 4 | BLU lighting test | Power LED bars; detect dead LED or string | 10-15 s automatic |
| 5 | Diffuser plate + optical films | Diffuser plate, diffuser sheet(s), prism/DBEF; **QD film for QLED** | Clean booth ISO 7-8; 2-3 ops |
| 6 | Middle frame | Mold frame / guide panel | 1-2 ops |
| 7 | Open cell mounting | OC unpack (manual or robot), ionizer cleaning, place on BLU, connect COF/FFC to T-CON | Clean booth; 2-4 ops; robot above 65" |
| 8 | Flip / front tape | Flip set face-down onto soft conveyor | Flipper |
| 9 | Board assembly | Main board, power board (PSU/LED driver), IR/key board, Wi-Fi/BT module, speakers, wire dressing | 4-6 ops |
| 10 | Back cover | Back cover placement; auto-screwdriver (8-16 screws); rating label, energy label | 2-4 ops |
| 11 | Power-on / SW download | Main SW, serial number, MAC, keys (HDCP, Widevine, etc.) written by MES/test server | 30-60 s (parallel positions) |
| 12 | Aging (burn-in) | Inline aging conveyor, set ON with test pattern | **20-60 min** in-line [E]; LG uses 15 min conveyor aging on OLED plus 72 h (168 h new models) on samples [S16] |
| 13 | White balance / gamma | Color analyzer (e.g. CA-410), auto adjust R/G/B gain | 20-40 s |
| 14 | Function test | HDMI x3-4, USB, tuner (DVB-T2/S2), Wi-Fi, BT, audio, remote IR, ports | 30-60 s; often split into 2 stations |
| 15 | Hi-pot / safety | Dielectric withstand: Class II **3000 V AC (or 4240 V DC)**; production test can be shortened to **1-3 s** from 1 min | [S19] |
| 16 | Final visual | Mura, dead pixel, light leakage, scratches, cosmetics | 1-2 ops |
| 17 | Accessories | Remote + batteries, stand, screws bag, power cord, manual, warranty card | 1-2 ops |
| 18 | Packing | Bag, EPS (or molded pulp), carton, taping, carton label (EAN + serial) | 2-3 ops |
| 19 | Weight check | Detects missing accessories (+/- 50-100 g) | automatic |
| 20 | Palletizing | 55": about 10-14 sets per pallet (2 tiers) [E]; stretch wrap; pallet label (SSCC) | 2 ops |

Total elapsed time for one set through the line is **15-20 min**, excluding long aging [S16].

### 1.3 Takt / line speed by size [E, consistent with conveyor-based OC-to-set lines]

| Size | Takt (s) | Theoretical UPH | Realistic UPH (OEE 75-85%) | Operators per line-shift (incl. packing) |
|---|---|---|---|---|
| 32-43" | 15-20 | 180-240 | 140-200 | 40-50 |
| 50-55" | 20-28 | 130-180 | 105-150 | 45-55 |
| 65" | 28-36 | 100-130 | 80-105 | 45-55 |
| 75" | 36-48 | 75-100 | 60-80 | 40-50 (2-person handling) |
| 85" | 45-60 | 60-80 | 45-65 | 40-50 (lift assist / robot) |

Productivity: about **2.5-4.0 sets per direct final-assembly operator-hour** for 43-55" and **1.3-2.0** for 75-85" [E].

### 1.4 SMT, THT, molding [E unless cited]

| Area | Typical values |
|---|---|
| TV main board | 600-1,200 placements per board (SoC, DDR, eMMC, PMIC, passives). Usually a 2-up panel. Line: printer, SPI, 2-3 mounters (60-120k CPH nominal; fastest machines up to 200k CPH [S20]), 10-zone reflow, AOI. Cycle **30-45 s per panel** (15-22 s per board). |
| SMT line efficiency | Average about **52%** placement utilization across 19 factories studied [S20]. SMT OEE 60-75% is typical. |
| Power board | SMT bottom side, then manual insertion of transformers and electrolytic caps (THT, 15-25 insertion ops), wave or selective solder, touch-up, ICT, hi-pot, burn-in 5-30 min. |
| T-CON | Usually supplied by the panel maker together with the open cell. Not built in-house. |
| Injection molding (back cover) | HIPS/ABS or PC/ABS back cover, 1.2-2.0 kg. Machines 1,300-1,600 t for 43-55", 1,800-2,500 t for 65-85". Cycle **55-90 s** single cavity; cooling is up to 80% of the cycle [S21]. Stand and small parts on 350-650 t machines. |

### 1.5 Shifts, OEE, yield, scrap

| Item | Typical | World-class | Source |
|---|---|---|---|
| Shift pattern (Egypt) | 2 x 8 h work + 1 h break; 6 days (Sat-Thu), Friday rest. 3 shifts only in peak or at SMT. | - | Law 14/2025: at most 8 h/day and 48 h/week, 1 h break, at most 5 h continuous [S5] |
| OEE, assembly line | 65-80% | 85%+ | [E] Nakajima convention |
| OEE, SMT | 55-70% | 80%+ | [E] |
| FPY, final assembly (set) | 95-97% | at least 98.5% | [E] |
| FPY, SMT (board, after AOI) | 97-99% | at least 99.5% | [E] |
| RTY (SMT x THT x FA) | 90-94% | at least 97% | [E] |
| SMT defect rate | 100-300 DPPM (per joint) | < 50 DPPM | [E] |
| Rework rate, FA | 3-5% of sets touched | < 1.5% | [E] |
| Scrap (panel breakage in handling) | 0.2-0.5% of OC | < 0.1% | [E] |
| DOA at customer | 0.3-0.8% | < 0.3% | [E] |

### 1.6 OQC / AQL (ISO 2859-1, general inspection level II) [E, standard tables]

| Lot size | Code letter | Sample size | AQL critical | AQL major | AQL minor |
|---|---|---|---|---|---|
| 501-1,200 | J | 80 | 0 (Ac 0) | 0.65 (Ac 1) | 1.5 (Ac 3) |
| 1,201-3,200 | K | 125 | 0 | 0.65 (Ac 2) | 1.5 (Ac 5) |
| 3,201-10,000 | L | 200 | 0 | 0.65 (Ac 3) | 1.5 (Ac 7) |

Brand owners also run an OBA (out-of-box audit) on finished cartons. LG re-tests 1 in 5 packed OLED sets for 48 h in QA rooms [S16].

---

## 2. Multi-level BOM of a 55" UHD / QLED TV

### 2.1 Structure (level 0 to 3) [E; component types are standard]

| Lvl | Component | Qty | Unit | Make/Buy | Typical source |
|---|---|---|---|---|---|
| 0 | TV set 55" UHD (FG), e.g. NV-55U | 1 | EA | Make | - |
| 1 | Display module (BLU + OC) - phantom or semi-FG | 1 | EA | Make (on line) | - |
| 2 | Open cell 55" UHD (with source PCB/COF) | 1 | EA | Buy | BOE, CSOT, HKC, (Innolux, AUO) - China/TW |
| 2 | T-CON board | 1 | EA | Buy (with OC) | Panel maker |
| 2 | Bottom chassis, galvanized steel 0.6-0.8 mm | 1 | EA | Buy | China or local stamping |
| 2 | LED bar (direct-lit), 6-10 bars x 6-10 LEDs | 8 | EA | Buy | China |
| 2 | Reflector sheet | 1 | EA | Buy | China |
| 2 | Diffuser plate (PS/PMMA 1.5-2 mm) | 1 | EA | Buy | China |
| 2 | Optical films: diffuser sheet / prism (+ QD film on QLED) | 2-3 | EA | Buy | China/Korea |
| 2 | Middle frame / mold frame | 1 set | SET | Buy | China/local |
| 1 | Main board PBA | 1 | EA | Make (SMT) | - |
| 2 | Bare PCB 4-layer | 1 | EA | Buy | China |
| 2 | SoC (MediaTek / Realtek / Amlogic class) | 1 | EA | Buy | Distributor |
| 2 | DDR4 1.5-2 GB + eMMC 8-16 GB | 1+1 | EA | Buy | Distributor (2026 allocation risk) |
| 2 | Wi-Fi/BT module, tuner, connectors, passives (about 800) | - | EA | Buy | China |
| 2 | Solder paste | 3-5 | g | Buy | - |
| 1 | Power board (PSU + LED driver) PBA | 1 | EA | Make (SMT+THT) or Buy | - |
| 1 | IR / key board | 1 | EA | Buy | China |
| 1 | Speaker 10 W | 2 | EA | Buy | China |
| 1 | Harness / FFC cables | 4-6 | EA | Buy | China/local |
| 1 | Back cover (HIPS/ABS) | 1 | EA | Make (molding) | - |
| 2 | Resin HIPS/ABS | 1.5 | KG | Buy | SABIC/INEOS via distributors; local compounding |
| 2 | Masterbatch black | 0.03 | KG | Buy | Local |
| 1 | Stand / feet (plastic or steel) | 2 | EA | Make/Buy | Local |
| 1 | Screws (various) | 25-40 | EA | Buy | Local/China |
| 1 | Tapes, gaskets, labels (rating, energy, serial) | set | SET | Buy | Local |
| 1 | Remote control + 2 AAA batteries | 1 | SET | Buy | China |
| 1 | Power cord (Europlug, 1.5 m) | 1 | EA | Buy | Local/China |
| 1 | Carton 5-ply, printed | 1 | EA | Buy | **Local** (10th of Ramadan / Sadat / 6 Oct) |
| 1 | EPS cushions (or molded pulp) | 2-4 | EA | Buy | **Local** |
| 1 | PE bag, manual, warranty card, accessory bag | set | SET | Buy | **Local** |
| 1 | SW / license (OS, Dolby, HEVC, HDMI royalty) | 1 | EA | Buy (non-stock) | Licensors |

### 2.2 Indicative open-cell prices (USD)

| Size | 2026 price | Source |
|---|---|---|
| 32" HD | 36-37 (May-Jul 2026) | [S8] |
| 43" FHD | 63-66 (May-Aug 2026) | [S8] |
| 50" UHD | about 95-100 | [E] |
| 55" UHD | **123** (Aug 20, 2026; low 116, high 126) | [S9] |
| 65" UHD | 173-177 (May-Aug 2026) | [S8] |
| 75" UHD | about 225-235 | [E] (TrendForce tracks it; only a +1 USD move in Apr 2026 was public) |
| 85" UHD | about 340-380 | [E] |

TrendForce reported rising prices in Q1 2026 and falls of about 1 USD per month from Jun to Aug 2026 [S8].

### 2.3 Material cost by size, 2026 (USD per set) [E, anchored on S7-S9]

| Block | 43" UHD | 50" UHD | 55" UHD | 55" QLED | 65" UHD | 65" QLED | 75" UHD | 85" UHD |
|---|---|---|---|---|---|---|---|---|
| Open cell | 63 | 97 | 123 | 123 | 173 | 173 | 230 | 360 |
| BLU (LED bars, plate, films, reflector, chassis, frame) | 16 | 20 | 24 | 36 (QD film) | 32 | 48 | 42 | 58 |
| Main board (incl. memory at 2026 prices) | 27 | 28 | 29 | 33 | 30 | 34 | 31 | 32 |
| Power board | 8 | 9 | 11 | 12 | 13 | 14 | 16 | 20 |
| T-CON | 3 | 3.5 | 4 | 4 | 4.5 | 4.5 | 5 | 6 |
| Mechanicals (back cover, stand, screws, tapes) | 8 | 10 | 12 | 12 | 16 | 16 | 22 | 30 |
| Audio, remote, cord, harness | 5 | 5 | 5.5 | 6 | 6 | 6.5 | 6.5 | 7 |
| Packaging (carton, EPS, bag, print) | 6 | 7 | 8 | 8 | 11 | 11 | 14 | 18 |
| SW / licenses / royalties | 5 | 5 | 5.5 | 6.5 | 6 | 7 | 6.5 | 7 |
| **Total material (FOB/ex-works)** | **141** | **184.5** | **222** | **240.5** | **291.5** | **314** | **373** | **538** |
| Open cell as % of material | 45% | 53% | 55% | 51% | 59% | 55% | 62% | 67% |
| Module (OC + BLU) as % of material | 56% | 63% | 66% | 66% | 70% | 70% | 73% | 78% |

Landed adders on imported material (about 90% of value): freight + insurance about 2.5%, component duty about 2% (average, see §3.6), port/clearance/trucking about 0.5%. Total about **+4.5% of material** [E].

### 2.4 Scrap allowances (component scrap in the material master / BOM) [E]

| Item | Allowance |
|---|---|
| Open cell | 0.3% (handling, lighting defects not claimable) |
| LED bars, films, diffuser | 0.5-1.0% |
| SMT passives (reel) | 0.3-1.0% (attrition); SoC/memory 0.1% |
| Solder paste | 5-10% |
| Resin (runners/purge) | 2-4% (regrind up to 15-25% allowed on non-cosmetic parts) |
| Cartons / EPS | 0.5-1% |
| Screws, labels | 1-2% |

### 2.5 BOM cost vs. price chain (55" UHD example)

| Step | Value | Source |
|---|---|---|
| Samsung 55" Crystal UHD U8000F retail, Samsung.com Egypt | EGP 21,999 (Mar 2026 promo; list 22,999) | [S12] |
| Challenger brand retail (sample NV-55U) | EGP 18,999 incl. 14% VAT | [E] |
| Net of VAT | EGP 16,666 | calc |
| Retailer margin about 15% | Sell-in about EGP 14,166 = **USD 278** at 51 EGP/USD | [E] |
| Standard cost (material 222 x 1.045 + conversion 9) | **USD 241** | [E] |
| Gross margin | about 13% | TCL large-display segment GM 15.9% (H1 2025) [S26] |

---

## 3. Supply chain

### 3.1 Sources

| Commodity | Main sources | Notes |
|---|---|---|
| Open cell | **BOE, CSOT (TCL), HKC** (China); Innolux, AUO (TW) | Chinese makers dominate large sizes. Allocation is negotiated monthly or quarterly. |
| SoC | MediaTek, Realtek, Amlogic, Novatek (TW/CN) | Through franchised distributors |
| Memory | Samsung, SK hynix, Micron, CXMT | 2026 price surge [S7] |
| LED bars, films, diffuser, chassis | China | QD film (QLED) from Korea/China |
| Resin (HIPS/ABS/PP) | SABIC, INEOS, LG Chem via Egyptian distributors | 2-4 weeks |
| Cartons, EPS, printed matter, labels | **Local Egyptian suppliers** (10th of Ramadan, Sadat City, 6th of October) | 3-10 days [E] |
| Screws, harnesses, power cords | Local + China | - |

### 3.2 Lead times (PO to plant)

| Leg | Days | Source |
|---|---|---|
| Open cell manufacture / allocation, PO to ex-works | 28-42 | [E] |
| Inland China + port cut-off | 3-5 | [E] |
| Sea freight Ningbo/Shanghai to **Ain Sokhna** (direct, no Suez transit) | **20-24** | [S13] |
| Sea freight China to Alexandria / Port Said / Damietta | 24-49 depending on routing | [S13] |
| Egyptian customs release (sea) | avg **5.6** (early 2025); official target 2 days | [S15] |
| Truck Sokhna to 10th of Ramadan (about 110 km) | 1 | [E] |
| **Total open-cell pipeline** | **about 60-75 days (9-11 weeks)** | [E] |
| SoC / memory | 8-16 weeks (memory on allocation in 2026) | [E] |
| Local cartons / EPS | 3-10 days | [E] |

### 3.3 Freight and containers

| Item | Value | Source |
|---|---|---|
| 40HC China to Egypt | about USD 4,100 (Jun 2026 baseline); Shanghai to Sokhna quotes USD 6,950-8,225 | [S13] |
| 20GP China to Egypt | USD 2,660-4,900 | [S13] |
| Port free time | about 21 days before demurrage | [S13] |
| 40HC internal | 12.03 x 2.35 x 2.70 m, about 76 m3 | [S27] |

**Finished TVs per 40HC** [E, from typical carton sizes at about 85% volume use]:

| Size | Carton (mm, approx.) | m3/carton | Sets per 40HC |
|---|---|---|---|
| 43" | 1,050 x 145 x 650 | 0.099 | 600-650 |
| 50" | 1,220 x 150 x 750 | 0.137 | 440-470 |
| 55" | 1,350 x 160 x 830 | 0.179 | 340-360 |
| 65" | 1,570 x 180 x 960 | 0.271 | 220-235 |
| 75" | 1,800 x 200 x 1,090 | 0.392 | 150-160 |
| 85" | 2,040 x 230 x 1,240 | 0.582 | 95-105 |

Open cells ship in multi-unit pallet boxes. A 40HC holds about **1,200-1,600 x 55" OC** [E]. For MRP, use a rounding value of 1 pallet box (e.g. 30-40 pcs for 55") [E].

### 3.4 Commercial terms

| Topic | Practice | Source |
|---|---|---|
| Incoterms, inbound | FOB Shanghai/Ningbo/Shenzhen (buyer's forwarder) or CIF Ain Sokhna | [E] |
| Incoterms, export | FOB Sokhna/Alexandria; CIF Jebel Ali/Dammam/Mombasa for key accounts | [E] |
| Payment, open cell | T/T 30% advance + 70% against copy B/L; or LC at sight; established buyers get OA 30-60 days (often credit-insured) | [E] |
| Egyptian import finance | Mandatory LC (Feb 2022) cancelled **29 Dec 2022**; documentary collection allowed | [S24] |
| MOQ | Open cell: 1 pallet box per model, commercially about 1 container per order; SoC: reel/tray (e.g. 1,000-2,000); cartons: 500-1,000 | [E] |
| Safety stock | Open cell 1-2 weeks at plant + 4-5 weeks in transit; SoC/memory 4-6 weeks (allocation); local packaging 3-5 days; FG 1-2 weeks | [E] |

### 3.5 Egyptian customs and trade compliance

| Item | Value | Source |
|---|---|---|
| **ACID** (19-digit Advance Cargo Information Declaration) via **Nafeza** | Must exist before shipment and appear on invoice, B/L and packing list; data about 48 h before departure; mandatory for air cargo from 1 Jan 2026 | [S14][S15] |
| Duty, finished TVs/monitors | **40%** (unified; Presidential Decree 419/2018 framework) | [S17] |
| Duty, components | Low: many inputs cut under local-manufacturing tariff reforms. LED components exempt, LED plastic/glass parts 5%, electronics components about 2% average (mobile case). **Use 2-5% for TV parts; verify per HS line.** | [S17][S18] + [E] |
| VAT on imports | 14% on (CIF + duty); recoverable as input VAT | [S22] |

### 3.6 Currency

| Item | Value | Source |
|---|---|---|
| USD/EGP, 1 Sep 2026 (5-bank average) | **50.94 / 51.04** | [S10] |
| 2026 range | 46.60 (16 Feb) to 54.85 (31 Mar); average about 50.5 | [S11] |
| CBE policy rates (held 20 Aug 2026) | Overnight deposit 19.00%, lending 20.00%, main operation 19.50% | [S25] |
| Inflation, Aug 2026 | Headline 12.7% (CAPMAS); urban 14.5% | [S28] |

---

## 4. Planning: S&OP, MPS, MRP, capacity, seasonality

### 4.1 Monthly S&OP cycle (industry-standard 5 steps) [E, standard practice]

| Week | Step | Owner | Output |
|---|---|---|---|
| W1 | Data gathering + statistical forecast (sell-out, sell-in, channel stock) | Demand planning | Baseline forecast, 18 months, by model/size/channel |
| W2 | **Demand review** (promotions: Ramadan, White Friday, World Cup; new models; price moves) | Sales, marketing | Unconstrained consensus demand |
| W3 | **Supply review** (RCCP on FA/SMT/molding, panel allocation, memory constraints, container bookings) | SCM, plant | Constrained supply plan, gaps, scenarios |
| W3 end | **Pre-S&OP** (financial reconciliation, EGP/USD scenario, margin by model) | Finance + SCM | Recommendations, open decisions |
| W4 | **Executive S&OP** | CEO, CFO, Sales, Ops | Approved volume plan; releases panel POs for M+2/M+3 |

TV makers run this monthly, with a **weekly** supply-planning (MPS) cycle inside it, because panel prices and allocation move monthly [S8].

### 4.2 MPS time fences (recommended for a TV assembler) [E]

| Fence | Horizon | Rule | SAP mapping |
|---|---|---|---|
| **Frozen** | 0-2 weeks | Daily line sequence fixed; changes need plant director approval | Planning time fence 14 days, firming type 1-4 (MRP type M1/P1); firmed planned orders [S23] |
| **Slushy** | 3-8 weeks | Mix changes only within a size family whose panels are already shipped; no volume increase beyond panels in transit | Firmed planned orders, manual changes |
| **Liquid** | 9+ weeks | Free re-planning; panel POs can still change | Unfirmed planned orders / MRP proposals |

### 4.3 MRP logic (per material, per bucket)

1. **Gross requirement** = MPS quantity x BOM quantity x (1 + component scrap %).
2. **Net requirement** = Gross - on-hand (unrestricted) - scheduled receipts (open POs incl. in-transit, firmed orders) + safety stock.
3. **Lot sizing**: open cell = fixed multiple of pallet box, weekly bucket. Cartons/EPS = lot-for-lot daily/weekly. Resin = fixed lot (bags/octabins). SMT reels = rounding to reel. Screws = min lot / Kanban.
4. **Lead-time offset**: planned delivery time (OC 70 d, SoC 90 d, cartons 7 d) + GR processing time (1-2 d, QM inspection).
5. **Proposals**: planned orders (in-house items: FG, main board, back cover) and purchase requisitions (bought items).
6. **Conversion**: planned order to production order (released to MES in the frozen zone); PR to PO (buyer, against a scheduling agreement for panels).
7. **Exceptions**: reschedule-in/out, overdue, below safety stock. Reviewed daily by the MRP controller.

### 4.4 Capacity (RCCP) - sample plant [E]

Available time per shift = 8.0 h - 0.5 h (meeting/5S/changeover) = 7.5 h = 27,000 s. Output = 27,000 / takt x OEE.

| Line | Size range | Takt | OEE | Sets/shift | Shifts | Days/yr | Capacity/yr |
|---|---|---|---|---|---|---|---|
| FA-1 | 43-55" UHD | 20 s | 0.80 | 1,080 | 2 | 290 | 626,000 |
| FA-2 | 55-65" UHD/QLED | 28 s | 0.80 | 771 | 2 | 290 | 447,000 |
| FA-3 | 75-85" | 45 s | 0.80 | 480 | 1 | 290 | 139,000 |
| **Plant** | | | | **4,182/day** | | | **about 1.21 M** |

Working days: 52 x 6 = 312, minus about 14 public holidays and 8 days of planned shutdown/inventory = **290** [E].

### 4.5 Seasonality (Egypt domestic; monthly index, average = 1.00) [E, with event dates]

| Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1.15 | 1.25 | 0.95 | 0.85 | 1.00 | 1.05 | 0.85 | 0.85 | 0.95 | 0.95 | 1.25 | 0.90 |

Drivers:
- **Pre-Ramadan/Ramadan.** Ramadan 2026 was about 18 Feb-19 Mar. Samsung Egypt ran "Eid offers" on 17-31 Mar 2026 [S12]. Ramadan 2027 is about 8 Feb-9 Mar and moves about 11 days earlier each year.
- **FIFA World Cup 2026** (11 Jun-19 Jul), with Egypt qualified [S29].
- **Back-to-school** in September.
- **White Friday / Black Friday.** Samsung Egypt's Black Friday price list ran 9-30 Nov 2025 [S12b].
- **Exports** (GCC, Africa) are flatter, with a peak in Q3-Q4 for GCC Ramadan and year-end stocking.

### 4.6 Forecast accuracy (1 - MAPE, model x month, lag 1) [E]

| Level | Typical | Best-in-class |
|---|---|---|
| Size-family x month | 75-85% | 90% |
| Model (SKU) x month | 55-70% | 80%+ |
| Model x week | 40-55% | 65% |

---

## 5. Sales and outbound logistics

| Topic | Reference | Source |
|---|---|---|
| Egypt TV channels | Appliance & electronics specialists lead: **B.TECH** (omnichannel + consumer finance), **2B**, **Raya Shop**, Carrefour (MAF), Spinneys, Hyper One, e-commerce (Amazon.eg, Noon, Jumia), plus brand e-stores. Samsung leads TVs in 2025. | [S30] |
| Market reference | Samsung held 37% of Egypt's TV market in 2016; the market was about 500k units in 2015 and has grown since. Samsung Beni Suef: about 6 M units/yr capacity (TV, monitors, tablets), about 85% exported to 55+ countries; about 1,800 employees (older figure). | [S31][S32] |
| Consumer finance | Installments via valU, Contact, bank cards (in Samsung Egypt T&Cs) | [S12] |
| Retail credit terms | Key accounts 45-90 days (open account, credit-insured or bank guarantee); traditional dealers 30-60 days or post-dated cheques; e-commerce 30 days | [E] |
| Export terms | GCC distributors: LC at sight or CAD / 30-60 days insured; Africa: LC at sight or 30-50% advance | [E] |
| Order to delivery | Domestic MTS from FG stock: 2-5 days; export MTO: 3-6 weeks (slot + booking); Sokhna to Jebel Ali about 7-12 days sea | [E] |
| ATP / CTP | ATP = on-hand + planned receipts - committed orders, per model/week. CTP adds a capacity + material check (open cells in transit are the binding constraint). | standard |
| OTIF | Orders delivered on the agreed date **and** in full / total orders. World-class **95-98%**; many retail contracts require at least 95% | [S33] |
| OTD | On-time only (date vs. confirmed date); report both vs. requested and vs. confirmed date | standard |
| Warranty | Samsung Egypt: 2-year warranty (2016) | [S31] |
| Field failure | About 3% of LCD TVs needed repair in the first 3 years (Consumer Reports); brands range 2-7% | [S34] |
| Returns / warranty provision | 1st-year service-call rate 1-2.5%; warranty provision 1.5-2.5% of net sales | [E] |

---

## 6. HR for the plant

### 6.1 Labour law (Egypt Labour Law No. 14 of 2025, in force 1 Sep 2025) [S5][S6][S35]

| Topic | Rule |
|---|---|
| Hours | At most 8 h/day, 48 h/week, excluding breaks; breaks at least 1 h total; at most 5 h continuous [S5] |
| Overtime | Premium at least **35% day**, at least **70% night** [S35]. Total daily hours incl. OT are capped; sources quote 10-12 h, so **verify the exact cap**. |
| Weekly rest | At least 1 paid day (normally Friday). Work on the rest day gets a **substitute day** [S35], plus pay per company policy (commonly 100% premium) [E]. |
| Annual leave | 15 days (1st year), 21 days (from 2nd year), 30 days (10 years' service or age 50+), 45 days (disability), +7 days for hazardous/remote work; at least 6 consecutive days [S5][S35] |
| Casual leave | Up to 7 days/yr [S35] |
| Maternity | 4 months paid per Mondaq; Andersen summary says 3 months (up to 3 times). **Verify the final text.** At least 1 h/day reduction from 6th month; no OT for 6 months after birth [S6][S35] |
| Women at night | Absolute ban on night work/OT for women lifted [S6] |
| Annual raise | At least **3% of insurable wage**, yearly from hire date [S6] |
| Termination without misconduct | **2 months' wages per year of service** [S6] |
| Minimum wage (private sector) | **EGP 7,000/month** since 1 Mar 2025 (National Wages Council). Public sector EGP 8,000 from Jul 2026. [S1] |

### 6.2 Social insurance and payroll deductions

| Item | Employee | Employer | Base / note | Source |
|---|---|---|---|---|
| Social insurance (Law 148/2019) | **11%** | **18.75%** | Insurable wage, min EGP 2,700, max EGP 16,700/month (2026). Employer max EGP 3,131.25; employee max EGP 1,837. Limits rise 15%/yr on 1 Jan (7-year schedule from 2021). | [S3][S4] |
| Comprehensive Health Insurance | 1% | 4% | Only in governorates where rolled out (not yet Sharqia/Cairo), so **not applicable to 10th of Ramadan now** [E] | [S36] |
| Martyrs & Victims Fund | 0.05% of gross | - | Stamp-type deduction | [S36] |
| Training Fund | - | 0.25% (30+ staff) | Verify under Law 14/2025 | [S36] |
| Income tax (salaries) | Progressive 0-27.5% | - | Annual personal exemption EGP 20,000. Bands: 0-40k 0%, 40-55k 10%, 55-70k 15%, 70-200k 20%, 200-400k 22.5%, 400k-1.2M 25%, above 1.2M 27.5% | [S37] |

### 6.3 Wages 2026 (gross monthly EGP, 10th of Ramadan, multinational-style assembler) [E, bounded by S1, S2]

Paylab 2026 monthly gross ranges: machine operator 6,205-12,725; maintenance engineer 8,018-21,485; process engineer 7,684-20,691; operations supervisor 7,128-24,207; 80% of production staff earn 5,922-20,416 [S2].

| Grade | Role examples | Range (EGP/month gross) | Sample value |
|---|---|---|---|
| G1 | Line operator, packer (entry) | 7,000-8,500 | 7,800 |
| G2 | Skilled operator (SMT, test, molding), forklift driver | 8,500-10,500 | 9,500 |
| G3 | Line leader, repair technician, IQC/OQC inspector | 10,000-14,000 | 12,000 |
| G4 | Maintenance/SMT/test technician, planner, buyer, accountant | 12,000-18,000 | 15,000 |
| G5 | Engineer (0-3 yr): process, quality, IE, test SW | 15,000-22,000 | 18,500 |
| G6 | Senior engineer, supervisor, MRP controller | 22,000-35,000 | 28,000 |
| G7 | Section manager / head | 40,000-65,000 | 52,000 |
| G8 | Department manager / director | 75,000-150,000 | 100,000 |

Typical allowances: company buses (the norm for 10th of Ramadan), subsidized meals, private medical insurance, night-shift allowance of 10-20% of basic (company policy, not statutory), attendance bonus, and a profit share (legally required for joint-stock companies, commonly 10% of distributable profit, capped at annual basic wages) [E].

Fully loaded cost of a G1 operator: about EGP 12,000-13,000/month = about USD 240-255, or about **USD 1.2/paid hour** [E].

### 6.4 Workforce practice [E]

| Topic | Typical value |
|---|---|
| Hiring lead time | Operators 1-3 weeks (mass hiring, medical, social insurance registration). Technicians 4-8 weeks. Engineers 6-12 weeks. |
| Induction / qualification | 2-3 days induction + EHS + **ESD (IEC 61340-5-1 / ANSI/ESD S20.20) training and wrist-strap/heel test** + 3-10 days on-the-job certification per station. **IPC-A-610** for inspectors/repair (certified IPC trainer, 3-4 days). IPC J-STD-001 for soldering operators. |
| Skill matrix | Station certification (levels 1-4) stored in HR and checked by MES at log-in (skill gating) |
| Temporary / seasonal workers | +10-15% of direct labour on fixed-term contracts (3-6 months) for Q4 and pre-Ramadan peaks |
| Absenteeism | 3-6% (higher around Ramadan/Eid and harvest seasons in Upper Egypt) |
| Turnover (operators) | 20-40%/yr; engineers 10-15%/yr |

---

## 7. Finance

| Topic | Reference | Source |
|---|---|---|
| Cost structure (COGS) of an OC-based TV assembler | Material **92-96%**, direct labour **1-2%**, manufacturing overhead **3-6%** (depreciation, utilities, indirect labour, maintenance, scrap) | [E] |
| Gross margin | TV assembler/brand **10-18%**; TCL large-display segment 15.9% (H1 2025) | [S26] |
| Standard vs. actual costing | Standard cost per model (cost estimate) revalued quarterly or on panel price moves above 3%. Purchased materials at moving average; purchase price variance (PPV) at GR/IR. Production variances (quantity, price, resource-usage, lot-size) at order settlement. FX revaluation of USD payables monthly. | standard |
| WIP accounting | Month-end WIP on open production orders (FA orders normally close daily/weekly, so WIP is small; SMT boards in stock as semi-finished). Result analysis / WIP at actual or target cost; settled to FI. | standard |
| Working capital | DIO 40-60 days (incl. panels in transit, owned from FOB). DSO 45-75 days (domestic retail), 15-45 (export LC/CAD). DPO 30-60 days. **Cash-to-cash 50-80 days** typical; best-in-class 20-40. | [E] |
| Bank facilities | Import LC / documentary-collection lines (USD), EGP overdraft/revolving about CBE corridor + 1-3% (about 20.5-23%), USD facilities about SOFR + 4-6%, LC confirmation fees 0.5-1.5%/qtr | [S25] + [E] |
| Corporate income tax | **22.5%** | [S22] |
| VAT | **14%**, monthly returns | [S22] |
| Withholding on local suppliers | 1-5% on payments above EGP 300 (verify; current tax-procedure thresholds change) | [S22] |
| E-invoicing / e-receipt (ETA) | B2B e-invoice mandatory for all VAT-registered taxpayers (since 2020, full by mid-2023). B2C e-receipt since Jul 2023. Invoices are signed and submitted to the ETA portal and get a UUID; ERP must integrate. | [S22] |
| Energy | Industrial electricity tariffs raised in Sep 2024 to about EGP 1.74-2.34/kWh by bracket; plan about EGP 2.0-2.5/kWh in 2026 | [S38] + [E] |

---

## 8. KPIs - world-class vs. typical

| KPI | Definition | World-class | Typical | Source |
|---|---|---|---|---|
| OTIF | Orders on time AND in full / total orders | 95-98% | 85-92% | [S33] + [E] |
| OTD | Lines shipped on/before confirmed date / total | at least 98% | 90-95% | [E] |
| Forecast accuracy | 1 - MAPE, SKU x month, lag 1 | 80%+ | 55-70% | [E] |
| Forecast bias | sum(F - A) / sum(A) | within +/-3% | +/-10% | [E] |
| Inventory turns | COGS / average inventory | 10-12 | 6-8 | [E] |
| Days of cover (FG) | FG stock / average daily demand | 7-10 d | 15-25 d | [E] |
| Days of cover (OC at plant) | - | 5-7 d | 10-15 d | [E] |
| OEE (assembly) | Availability x Performance x Quality | at least 85% | 65-80% | [E] |
| FPY (final assembly) | Good first pass / input | at least 98.5% | 95-97% | [E] |
| Outgoing quality (OQC lot reject) | Rejected lots / lots | < 0.5% | 1-3% | [E] |
| Field DPPM (DOA) | DOA units / shipped units x 1e6 | < 3,000 | 3,000-8,000 | [E] |
| Schedule adherence | Sum of min(actual, plan) per model/day / plan | at least 95% | 85-90% | [E] |
| Labour productivity (FA, 55") | Sets / direct FA person-hour | 3.5-4.5 | 2.5-3.2 | [E] |
| Plant productivity | Sets / total employee / year | 2,000+ | 1,000-1,500 | [E]; Samsung Beni Suef about 3,000+ (automated, older headcount) [S32] |
| Conversion cost / set (55") | Labour + overhead | USD 6-8 | USD 9-14 | [E] |
| Cash-to-cash | DIO + DSO - DPO | 20-40 d | 50-80 d | [E] |

---

## 9. How SAP, MES and HR structure the process

### 9.1 End-to-end document chain and system ownership (ISA-95 L4 = ERP, L3 = MES) [S39]

| # | Step | Document (SAP S/4HANA) | Typical T-code / app | Owner system |
|---|---|---|---|---|
| 1 | Demand plan / S&OP | Planning version, released PIRs | SAP IBP (S&OP, Demand, Supply) -> MD61 / PIR | IBP -> ERP |
| 2 | Customer order | **Sales order** (+ ATP/aATP check, credit check) | VA01 / Fiori "Manage Sales Orders" | ERP (SD) |
| 3 | Planning | **MRP run** (MRP Live) | MD01N; MD04 stock/requirements | ERP (PP) |
| 4 | Proposals | **Planned orders** (make), **purchase requisitions** (buy) | MD04; ME51N | ERP |
| 5 | Procurement | **Purchase order** / scheduling agreement (panels) | ME21N / ME31L | ERP (MM) |
| 6 | Import | Inbound delivery, ACID/Nafeza reference, customs entry, landed cost (condition types for freight, duty) | VL31N; MIRO for duty/freight | ERP + Nafeza |
| 7 | Receipt | **Goods receipt** (mvt 101), QM inspection lot | MIGO; QA32 | ERP (MM/QM); IQC results may come from MES/QMS |
| 8 | Conversion | Planned order -> **production order** | CO40/CO41 (collective) | ERP |
| 9 | Release to shop floor | Order release -> download to MES (order, BOM, routing, serial ranges) | CO02; IDoc LOIPRO / SAP DMC / MII-PCo | ERP -> MES |
| 10 | Execution | Dispatch to line, material staging (kitting), serial/2D-code binding, station tracking, test results, genealogy (OC S/N, main-board S/N, key IDs), SPC, repair loop | MES | **MES** |
| 11 | Staging | Transfer posting warehouse -> line (mvt 311) or EWM staging | MIGO / EWM | ERP/EWM (triggered by MES) |
| 12 | Confirmation | Yield/scrap per operation; **goods issue** by backflush (mvt 261); **goods receipt** of FG (mvt 101) | CO11N / IDoc CONF / DMC | MES sends -> ERP posts |
| 13 | OQC / release | Inspection lot for FG; usage decision | QA11 | MES/QMS -> ERP |
| 14 | Outbound | **Outbound delivery**, picking, packing (HU/SSCC), **post goods issue** (mvt 601) | VL01N; VL02N | ERP (SD/EWM) |
| 15 | Billing | **Billing document** -> accounting document; **ETA e-invoice** submission (UUID) | VF01 + ETA connector | ERP + ETA |
| 16 | Payment | Incoming payment / clearing; for imports: LC or CAD settlement | F-28 / Fiori; F110 (AP) | ERP (FI) |
| 17 | Period-end | WIP calc, variance calc, order settlement, material ledger actual costing, FX revaluation | KKAX / KKS2 / CO88 / CKMLCP / FAGL_FCV | ERP (CO/FI) |

### 9.2 Integration points ERP <-> MES <-> HR

| Direction | Data | Frequency | Typical mechanism |
|---|---|---|---|
| ERP -> MES | Material master, BOM, routing / work plan, production orders, serial number ranges, customer-specific labels | On change / on release | IDoc (MATMAS, BOMMAT, LOIROU, LOIPRO), SAP DMC / MII, B2MML (ISA-95) [S39] |
| MES -> ERP | Operation confirmations (yield, scrap, rework), backflush consumption, FG receipt, scrap by reason, machine/line times (activity quantities) | Real time or every 15-60 min | CONF / goods-movement IDoc, OData / REST |
| MES -> ERP (QM) | Inspection results, OQC lot decisions, non-conformances | Per lot | QM interface |
| HR -> MES | Employee master (ID, badge), organizational unit, shift roster, **qualifications/certifications** (ESD, IPC-A-610, station certificates with expiry) | Daily / on change | SuccessFactors Employee Central / Workday API; MES blocks log-in if a certificate is expired |
| MES -> HR (Time) | Clock-in/out at line, station log-in hours, overtime actually worked | Daily | Time Tracking (SF) / Workday Time; then payroll |
| HR -> ERP (FI/CO) | Payroll posting (wages, SI 11% / 18.75%, tax) per cost center | Monthly | Payroll -> FI posting (SF Employee Central Payroll / Workday) |
| ERP (CO) <-> MES | Activity rates (labour, machine), cost centers per line | Yearly / monthly | Master data |

### 9.3 Reference products

| Domain | World-class products | Notes |
|---|---|---|
| ERP | SAP S/4HANA (PP, MM, SD, QM, EWM, FI, CO), SAP IBP | Planning time fence + firming types [S23] |
| MES | Siemens Opcenter Execution Electronics, Samsung SDS **Nexplant MES**, Samsung in-house GMES, SAP Digital Manufacturing | Nexplant: scheduling, resource/process control, yield/equipment data collection, equipment automation [S40] |
| HR | SAP SuccessFactors (Employee Central, Time Tracking, Learning, ECP), Workday HCM | Learning module stores ESD/IPC certifications |

---

## 10. Recommended sample parameters (Nile Vision Electronics S.A.E.)

### 10.1 Company, plant, capacity

| Parameter | Value | Basis |
|---|---|---|
| Legal entity | Nile Vision Electronics S.A.E. (invented), 10th of Ramadan City, Sharqia | - |
| Functional / reporting currency | EGP (functional); USD for imports & exports | - |
| Exchange rate (plan 2026 H2) | **51.00 EGP/USD** (budget); sensitivity 48 / 55 | [S10][S11] |
| Final assembly lines | 3 (FA-1 43-55", FA-2 55-65", FA-3 75-85") | [E] |
| SMT lines | 2 (main board; power board SMT) + 1 THT/wave line | [E] |
| Injection molding | 7 machines: 2 x 1,300 t, 2 x 1,800 t, 1 x 2,500 t, 2 x 450 t | [E] |
| Shifts | FA-1/FA-2/SMT 2 shifts; FA-3 1 shift; 8 h work + 1 h break; Sat-Thu | [S5] + [E] |
| Shift times | A 07:00-16:00, B 16:00-01:00 | [E] |
| Working days | 290/yr | [E] |
| Installed capacity | 1.21 M sets/yr (4,182/day) | §4.4 |
| Plan volume 2026/27 | **800,000 sets/yr** (avg 2,760/day; utilization 63-75% per line) | [E] |
| Split domestic / export | 70% Egypt / 30% export (GCC, Iraq, Libya, East Africa) | [E] |

### 10.2 Product range (retail incl. VAT; sell-in = retail / 1.14 x 0.85; FX 51) [E; anchored on Samsung Egypt prices S12]

| Model | Size / type | Line | Mix | Units/yr | Samsung EG ref. retail | NV retail (EGP) | Sell-in (EGP) | Sell-in (USD) | Material (USD) | Std cost (USD) | GM % |
|---|---|---|---|---|---|---|---|---|---|---|---|
| NV-43U | 43" UHD | FA-1 | 20% | 160,000 | 16,499 (U8000F, Nov 25) | 12,499 | 9,319 | 182.7 | 141.0 | 154.3 | 15.5% |
| NV-50U | 50" UHD | FA-1 | 12% | 96,000 | 18,999 | 15,999 | 11,929 | 233.9 | 184.5 | 200.8 | 14.2% |
| NV-55U | 55" UHD | FA-1 | 20% | 160,000 | 21,999 | 18,999 | 14,166 | 277.8 | 222.0 | 241.0 | 13.2% |
| NV-55Q | 55" QLED | FA-2 | 10% | 80,000 | 24,999 (Q7F) | 21,499 | 16,030 | 314.3 | 240.5 | 260.8 | 17.0% |
| NV-65U | 65" UHD | FA-2 | 17% | 136,000 | 26,999 | 24,999 | 18,640 | 365.5 | 291.5 | 315.6 | 13.6% |
| NV-65Q | 65" QLED | FA-2 | 8% | 64,000 | 32,999 (Q7F) | 27,999 | 20,877 | 409.3 | 314.0 | 339.6 | 17.0% |
| NV-75U | 75" UHD | FA-3 | 9% | 72,000 | 35,999 | 31,999 | 23,859 | 467.8 | 373.0 | 403.8 | 13.7% |
| NV-85U | 85" UHD | FA-3 | 4% | 32,000 | 64,999 | 46,999 | 35,043 | 687.1 | 538.0 | 580.2 | 15.6% |
| **Total** | | | 100% | **800,000** | | | | avg 316 | | avg 270 | **14.6%** |

Std cost = material x 1.045 (landed) + conversion (USD 7 / 8 / 9 / 9.5 / 11 / 11.5 / 14 / 18 by model).

Line loading: FA-1 416k of 626k (66%), FA-2 280k of 447k (63%), FA-3 104k of 139k (75%).

Annual P&L (sample) [E]:

| Item | USD M | EGP bn (at 51) | % of sales |
|---|---|---|---|
| Net sales | 252.8 | 12.89 | 100% |
| COGS (standard) | 215.8 | 11.01 | 85.4% |
| Gross margin | 37.0 | 1.89 | 14.6% |
| Selling, marketing, warranty (2%), logistics out (1%) | 17.7 | 0.90 | 7.0% |
| G&A | 5.1 | 0.26 | 2.0% |
| EBIT | 14.2 | 0.72 | 5.6% |
| Interest | 4.0 | 0.20 | 1.6% |
| Tax 22.5% | 2.3 | 0.12 | - |

### 10.3 Supply parameters

| Parameter | Value | Basis |
|---|---|---|
| Open cell suppliers | CSOT (55/65/75), BOE (43/50/85), HKC (second source 43/55) | [E] |
| Open cell price (Sep 2026) | 43" 63 / 50" 97 / 55" 123 / 65" 173 / 75" 230 / 85" 360 USD | [S8][S9] + [E] |
| OC planned delivery time (MRP) | 70 days (35 production + 4 inland + 22 sea + 6 clearance + 1 truck + 2 GR) | [S13][S15] + [E] |
| Port of entry | Ain Sokhna (direct Red Sea service) | [S13] |
| Freight 40HC CN to Sokhna | USD 4,500 plan (range 4,100-8,200) | [S13] |
| Incoterm inbound / payment | FOB Shenzhen/Ningbo; T/T 30% advance + 70% vs copy B/L (CSOT, BOE); LC at sight (HKC) | [E] |
| Component duty / VAT | 2% avg duty on parts (verify HS); 14% import VAT recoverable | [S17][S18][S22] |
| Finished TV import duty (competitive protection) | 40% | [S17] |
| Safety stock | OC 7 days; SoC/memory 30 days; local packaging 4 days; FG 10 days | [E] |
| Lot sizing | OC: pallet box 30 pcs (55"), weekly; SoC reel 1,000; cartons lot-for-lot daily; resin 25 t | [E] |
| Local suppliers | Cartons (10th of Ramadan), EPS (Sadat City), resin distributor (Cairo), screws (Obour) - invented names | [E] |

### 10.4 Planning parameters

| Parameter | Value |
|---|---|
| S&OP | Monthly; exec S&OP in week 4; horizon 18 months |
| MPS | Weekly, by model and line; frozen 2 weeks, slushy 3-8 weeks, liquid 9+ weeks |
| MRP | Nightly MRP Live; planning time fence 14 days on FG (MRP type M1) |
| Forecast accuracy target / realistic actual | 75% / **66%** (SKU x month, lag 1) |
| Forecast bias actual | +6% (over-forecast, typical before Ramadan) |
| Seasonality index | See §4.5 |

### 10.5 Headcount (total 618 on payroll + about 60 contractors + up to 80 seasonal temps) [E]

| Area | Headcount | Direct/Indirect |
|---|---|---|
| Final assembly FA-1 (2 shifts x 56 incl. leader, handlers, repair, IPQC) | 112 | D |
| Final assembly FA-2 (2 x 58) | 116 | D |
| Final assembly FA-3 (1 x 49) | 49 | D |
| Relief / absence pool (8%) | 22 | D |
| SMT (2 lines x 2 shifts x 5) + SMT repair 4 | 24 | D |
| THT / wave / ICT (2 shifts x 22) | 44 | D |
| Injection molding (2 shifts x 8 + 4 setters) | 20 | D |
| **Direct subtotal** | **387 (63%)** | |
| Warehouse & logistics (receiving, stores, kitting, FG, shipping, import clerk) | 42 | I |
| Quality (IQC 10, OQC 10, lab 6, QE 8, customer quality 4) | 38 | I |
| Maintenance, facilities, tooling | 30 | I |
| Engineering (process, test/SW, IE, NPI, SMT) | 28 | I |
| Production management & supervisors | 16 | I |
| SCM / planning / purchasing | 18 | I |
| EHS | 4 | I |
| Finance & accounting | 12 | I |
| HR & admin (incl. clinic 2) | 12 | I |
| IT / MES | 6 | I |
| Sales, marketing, customer service (domestic + export) | 20 | I |
| Top management | 5 | I |
| **Indirect subtotal** | **231 (37%)** | |
| **Total** | **618** | |

### 10.6 HR parameters

| Parameter | Value | Basis |
|---|---|---|
| Minimum wage | EGP 7,000 | [S1] |
| Grade table | G1 7,800 ... G8 100,000 (see §6.3) | [E] bounded by [S2] |
| Social insurance | EE 11%, ER 18.75%; insurable wage 2,700-16,700 (2026) | [S3][S4] |
| Overtime | Day +35%, night +70%; rest-day work = substitute day + 100% premium (policy) | [S35] + [E] |
| Night-shift allowance | 15% of basic (company policy) | [E] |
| Annual increase | 3% of insurable wage (statutory minimum) + merit; plan 12% total for 2027 (inflation 12.7-14.5%) | [S6][S28] + [E] |
| Leave | 15 / 21 / 30 days per §6.1 | [S5] |
| Absenteeism actual | 4.5% (target 3%) | [E] |
| Operator turnover actual | 28%/yr | [E] |
| Hiring lead time | Operator 2 weeks; technician 6 weeks; engineer 10 weeks | [E] |
| Mandatory training | ESD (S20.20) before line access, renewed yearly; IPC-A-610 for inspectors/repair, recertified every 2 years; station certification (L1-L4) | [E] |
| Seasonal temps | Up to 80 on 3-6 month fixed-term contracts (Oct-Feb) | [E] |

### 10.7 Finance parameters

| Parameter | Value | Basis |
|---|---|---|
| Corporate tax | 22.5% | [S22] |
| VAT | 14% | [S22] |
| E-invoicing | ETA e-invoice (B2B) + e-receipt (B2C e-store) | [S22] |
| Costing | Standard cost per model, quarterly revaluation; moving average on purchased parts; PPV at GR; variances at order settlement; FX revaluation monthly | standard |
| Cost split of COGS | Material 95%, labour 1.5%, overhead 3.5% | [E] |
| DIO / DSO / DPO | 45 / 60 / 40 days, so cash-to-cash 65 days | [E] |
| Retail credit terms | B.TECH / 2B / Raya: 60 days; Carrefour: 45 days; e-commerce: 30 days; dealers: 30 days PDC | [E] |
| Export terms | GCC: LC at sight / CAD; Africa: 50% advance + LC | [E] |
| Bank facilities | USD import line 25 M (LC + CAD); EGP overdraft 750 M at 21.5% (corridor + 1.5%) | [S25] + [E] |
| Warranty | 2 years; provision 2.0% of net sales; 1st-year service call rate 1.8% | [S31] + [E] |

### 10.8 KPI targets vs. realistic actuals for the demo

| KPI | Target | Realistic actual (to show improvement potential) |
|---|---|---|
| OTIF (domestic key accounts) | 95% | 88% |
| OTD vs. confirmed date | 97% | 92% |
| Forecast accuracy (SKU/month, lag 1) | 75% | 66% |
| Inventory turns | 9 | 7.1 |
| FG days of cover | 10 d | 16 d |
| OC days of cover at plant | 7 d | 11 d |
| OEE FA lines | 82% | 74% |
| OEE SMT | 70% | 62% |
| FPY final assembly | 98.0% | 96.4% |
| FPY SMT (post-AOI) | 99.3% | 98.6% |
| OQC lot reject rate | 0.5% | 1.4% |
| DOA | 0.30% | 0.55% |
| Schedule adherence | 95% | 89% |
| Sets / direct FA person-hour (55") | 3.5 | 2.9 |
| Conversion cost / set (55") | USD 8.5 | USD 9.6 |
| Absenteeism | 3.0% | 4.5% |
| Cash-to-cash | 55 d | 65 d |

---

## Sources

- [S1] Baker McKenzie, "Egypt: Private sector - Minimum wage and minimum annual increase is now set": https://insightplus.bakermckenzie.com/bm/employment-compensation/egypt-private-sector-minimum-wage-and-minimum-annual-increase-is-now-set ; Hivedesk Egypt salary guide 2026: https://www.hivedesk.com/salary-guides/egypt
- [S2] Paylab Egypt, production salaries 2026: https://www.paylab.com/eg/salaryinfo/production?lang=en ; machine operator: https://www.paylab.com/eg/salaryinfo/production/machine-operator?lang=en
- [S3] Mondaq, "Social Insurance in Egypt" (11% / 18.75%, 2026 limits 2,700-16,700): https://www.mondaq.com/employee-rights-labour-relations/1810754/social-insurance-in-egypt
- [S4] Native Teams, Egypt payroll changes 2026: https://help.nativeteams.com/egypt-payroll-changes-2026 ; BDO: https://www.bdo.global/en-gb/insights/tax/expatriate-tax/egypt-maximum-and-minimum-salaries-subject-to-social-insurance-increased
- [S5] ZenHR, Egypt labor law reference: https://www.zenhr.com/en/egypt-labor-law ; RemotePass Egypt employment law 2026: https://www.remotepass.com/country/egypt/employment-laws
- [S6] Andersen Egypt, "Egypt's Labour Law 14/2025": https://eg.andersen.com/egypts-labour-law-14-2025/ ; Clyde & Co: https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law
- [S7] TrendForce via LEDinside (panel 40-50% of TV manufacturing cost; DRAM 2.5-3% to 6-7% of BOM; 2026 shipments 194.81 M): https://ledinside.com/intelligence/2026/08/2026_01_29_11
- [S8] TrendForce panel price reports (TechNews): May 2026 https://technews.tw/2026/05/05/panel-prices-in-2026-may-h1/ ; Apr 2026 https://technews.tw/2026/04/20/panel-prices-in-2026-april-h2/ ; Jun 2026 https://technews.tw/2026/06/22/panel-prices-in-2026-june-h2/
- [S9] TrendForce LCD panel price page (55" UHD OC USD 123, 20 Aug 2026): https://www.trendforce.com/price/lcd/panel
- [S10] Amwal Al Ghad, EGP 50.94/51.04, 1 Sep 2026: https://en.amwalalghad.com/?p=230472
- [S11] Pound Sterling Live, USD-EGP history 2026: https://www.poundsterlinglive.com/history/USD-EGP-2026
- [S12] Samsung Egypt TV price list and Eid offers, 17-31 Mar 2026: https://images.samsung.com/is/content/samsung/assets/eg/terms-and-conditions/deals/SEEG_TV_Offers_TCs_Eid_Offers_202603171.pdf
- [S12b] Samsung Egypt Black Friday TV price list, 9-30 Nov 2025: https://images.samsung.com/is/content/samsung/assets/eg/terms-and-conditions/SEEG_BF_revised_291025WS.pdf
- [S13] Nowlun, China to Egypt sea freight 2026 guide (transit, rates, ACID): https://www.nowlun.com/en/blogs/41-sea-freight-importing-from-china-to-egypt-the-complete-2026-guide-cost-transit-time-acid ; Goodhope freight Sep 2026: https://goodhopefreight.com/egypt/2026-freight.html
- [S14] Nafeza (Egypt national single window): https://www.nafeza.gov.eg/en/news/list
- [S15] Enterprise, customs clearance time and Nafeza: https://enterpriseam.com/egypt/2025/12/10/customs-authority-head-ahmad-amawi-on-customs-reforms-and-trade-movement-part-i/ ; https://enterpriseam.com/egypt/2025/08/27/govt-targets-early-2026-for-nafeza-air-freight-rollout/
- [S16] Korea Times / Korea JoongAng Daily, LG OLED TV line (15-20 min line, 15 min aging, 72/168 h sample aging, 1 in 5 re-tested 48 h): https://www.koreatimes.co.kr/amp/business/tech-science/20160606/thorough-inspection-brings-perfection-to-lgs-oled-tv ; https://www.koreajoongangdaily.com/business/inside-lg-electronics-oled-operations/11734020
- [S17] US ITA, Egypt Country Commercial Guide, import tariffs (TV screens/monitors 40%; LED components): https://www.trade.gov/country-commercial-guides/egypt-import-tariffs
- [S18] Business Today Egypt / Enterprise, tariff cuts on electronics components: https://www.businesstodayegypt.com/amp/1/2019/Parliament-approves-cutting-fees-on-mobile-production-components ; https://enterpriseam.com/egypt/2022/06/08/house-gives-final-nod-to-amended-customs-tariffs-in-bid-to-localize-industry/
- [S19] Vitrek, hipot testing requirements (Class II 3000 V AC / 4240 V DC, 1 min reducible to 1 s): https://vitrek.com/iec-60950-hipot-testing-requirements-test-setup-and-compliance-guidelines/ ; Hioki, IEC 62368-1 leakage: https://www.hioki.com/br-pt/support/faq/detail/id_n206130
- [S20] I-Connect007, SMT line efficiency (52% average): https://iconnect007.com/article/52474/line-efficiency-and-productivity-measures/52477/smt ; SparkFun community, placement rates: https://community.sparkfun.com/t/smt-placement-rate/26930
- [S21] Ajou University thesis, "TV back cover injection molding cycle time improvement": https://dspace.ajou.ac.kr/handle/2018.oak/21213 ; Autodesk Moldflow cycle time: https://help.autodesk.com/cloudhelp/2015/ENU/MoldflowComm/files/GUID-0D68C3B7-B64C-419C-B114-C5DABF71FECA.htm
- [S22] Healy Consultants, Egyptian accounting and tax 2025 (CIT 22.5%, VAT 14%, e-invoice, WHT): https://www.healyconsultants.com/?p=24466
- [S23] SAP Help, planning time fence / firming type: https://help.sap.com/saphelp_46c/helpdata/en/85/613275e24bd111950d0060b03c6b76/content.htm
- [S24] Business Today Egypt, CBE cancels LC requirement: https://www.businesstodayegypt.com/amp/7/1942/Lifting-Restrictions-on-Imports-Egypt’s-central-bank-cancels-working-with ; ICC: https://library.iccwbo.org/content/tfb/news/dcwn_03January2023112930.htm
- [S25] Financial Afrik, CBE keeps rates unchanged (Aug 2026): https://www.financialafrik.com/en/2026/08/24/egypt-central-bank-keeps-key-interest-rates-unchanged/ ; FocusEconomics: https://www.focus-economics.com/countries/egypt/news/monetary-policy/egypt-central-bank-meeting-20-08-2026-central-bank-of-egypt-holds-rates-in-august/
- [S26] TCL Electronics 2025 interim results (large-display GM 15.9%): https://doc.irasia.com/listco/hk/tclelectronics/interim/2025/intpress.pdf ; https://www.ledinside.com/node/35426
- [S27] iContainers, 40 ft high cube dimensions: https://www.icontainers.com/de/hilfe/40-fuss-high-cube-container/
- [S28] Ahram Online, Egypt headline inflation 12.7% in Aug 2026: https://english.ahram.org.eg/News/576399.aspx
- [S29] Foot Africa, Egypt qualifies for World Cup 2026: https://foot-africa.com/en/news/world-cup-2026-mohamed-salah-secures-qualification-for-egypt-911091/
- [S30] Euromonitor, Home Video in Egypt / Appliances and Electronics Specialists in Egypt: https://www.euromonitor.com/home-video-in-egypt/report ; https://www.euromonitor.com/appliances-and-electronics-specialists-in-egypt/report
- [S31] Amwal Al Ghad, "Samsung Egypt dominates TV market by 37%" (2016): https://en.amwalalghad.com/samsung-egypt-dominates-tv-market-by-37/
- [S32] MEA Tech Watch, Samsung Egypt regional hub (Beni Suef 6 M units, 85% export): https://meatechwatch.com/2024/08/28/samsung-electronics-eyes-egypt-as-a-regional-hub-for-electronics-production-and-exports ; CairoScene: https://cairoscene.com/Business/Koreans-come-to-Egypt's-Rescue
- [S33] Red Stag Fulfillment, OTIF benchmarks: https://redstagfulfillment.com/on-time-and-in-full-otif/
- [S34] InformationWeek, "LCD, Plasma TVs Found Highly Reliable" (Consumer Reports repair rates): https://www.informationweek.com/it-leadership/lcd-plasma-tvs-found-highly-reliable
- [S35] Mondaq, "Egypt Labour Law 14 of 2025 - workers' rights, employer duties": https://www.mondaq.com/employee-rights-labour-relations/1791586/egypt-labour-law-14-of-2025-%7C-workers-rights-employer-duties
- [S36] Boundless, Egypt country guide (Martyrs Fund, Training Fund, health insurance): https://boundlesshq.com/guides/egypt/
- [S37] Andersen Egypt, personal income tax 2026: https://eg.andersen.com/personal-income-tax/ ; PwC tax summaries: https://taxsummaries.pwc.com/egypt/individual/taxes-on-personal-income
- [S38] Enterprise, industrial electricity price hikes (Sep 2024): https://enterpriseam.com/egypt/2024/09/08/our-long-awaited-electricity-rate-hikes-are-here-capping-off-a-busy-summer-of-subsidy-reform/ ; Mada Masr: https://www.madamasr.com/en/?p=261257
- [S39] ISA-95 / B2MML: Sepasoft, "Understanding B2MML": https://docs.sepasoft.com/articles/user-manual/understanding-b2mml ; TeepTrak, MES architecture ISA-95: https://teeptrak.com/en/mes-architecture-isa-95-implementation-2026/
- [S40] Samsung SDS Nexplant MES: https://www.samsungsds.com/en/mes/nexplant-mes.html
