// The film set of the month-end scenes: the demo ceramic company («شركة السيراميك التجريبية», invented) in Mizan with a
// quarter of history (July to September 2026) built through Mizan's own API, so the dashboard and the statements have real
// figures: opening balances, raw materials bought on credit, production orders per product (BOM per 100 m²), sales
// invoices to three distributors, energy and maintenance bills, salaries, depreciation, collections and supplier payments.
// Every name and number is illustrative. The film itself records the last invoice of September and the month-end review.
const Q = 1000;                         // quantities in thousandths
const E = (egp) => Math.round(egp * 100); // money in piastres
const MONTHS = ['2026-07', '2026-08', '2026-09'];
const lastDay = (ym) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

export const MATERIALS = [
  { sku: 'RM-CLAY', en: 'Red clay', ar: 'طفلة حمراء', unit: 'kg', price: 2.4, supplier: 'S-CLAY' },
  { sku: 'RM-FELD', en: 'Feldspar', ar: 'فلسبار', unit: 'kg', price: 7, supplier: 'S-CLAY' },
  { sku: 'RM-GLZ', en: 'Glaze (frit)', ar: 'جليز (فريت)', unit: 'kg', price: 70, supplier: 'S-GLAZE' },
  { sku: 'PK-CTN', en: 'Carton 60x60', ar: 'كرتونة ٦٠×٦٠', unit: 'pc', price: 14, supplier: 'S-PACK' },
];
// per 100 m²
export const PRODUCTS = [
  { sku: 'TL-6060-WHT', en: 'Porcelain tile 60x60 white', ar: 'بورسلين ٦٠×٦٠ أبيض', price: 310, perMonth: [28_000, 30_000, 31_000], bom: [['RM-CLAY', 1800], ['RM-FELD', 400], ['RM-GLZ', 80], ['PK-CTN', 70]], hours: 6 },
  { sku: 'TL-6060-BEG', en: 'Porcelain tile 60x60 beige', ar: 'بورسلين ٦٠×٦٠ بيج', price: 300, perMonth: [18_000, 20_000, 19_000], bom: [['RM-CLAY', 1800], ['RM-FELD', 400], ['RM-GLZ', 85], ['PK-CTN', 70]], hours: 6 },
  { sku: 'TL-3060-WAL', en: 'Wall tile 30x60', ar: 'سيراميك حوائط ٣٠×٦٠', price: 260, perMonth: [14_000, 15_000, 16_000], bom: [['RM-CLAY', 1500], ['RM-FELD', 300], ['RM-GLZ', 70], ['PK-CTN', 70]], hours: 5 },
];
export const CUSTOMERS = [
  { code: 'C-DELTA', name: 'Delta Building Materials (distributor)', alt: 'الدلتا لمواد البناء (موزع)', city: 'Tanta', share: 0.45, terms: 30 },
  { code: 'C-UPPER', name: 'Upper Egypt Tiles Trading', alt: 'الصعيد لتجارة البلاط', city: 'Assiut', share: 0.30, terms: 45 },
  { code: 'C-CANAL', name: 'Canal Ceramics Showrooms', alt: 'معارض القناة للسيراميك', city: 'Ismailia', share: 0.25, terms: 30 },
];
const SUPPLIERS = [
  { code: 'S-CLAY', name: 'Aswan Clay & Minerals', alt: 'أسوان للطفلة والخامات', terms: 30 },
  { code: 'S-GLAZE', name: 'Frit & Glaze Supplies', alt: 'الفريت والجليز للتوريدات', terms: 45 },
  { code: 'S-PACK', name: 'Nile Cartons', alt: 'النيل للكرتون', terms: 30 },
  { code: 'S-POWER', name: 'Power distribution company (sample)', alt: 'شركة توزيع الكهرباء (عينة)', terms: 10 },
  { code: 'S-GAS', name: 'Natural gas company (sample)', alt: 'شركة الغاز الطبيعي (عينة)', terms: 10 },
  { code: 'S-MAINT', name: 'Kiln Service Engineering', alt: 'الهندسية لصيانة الأفران', terms: 30 },
];

/** Builds the quarter. `c` = { get(path), post(path, body), put(path, body) } on a signed-in Mizan. Returns the ids the film needs. */
export async function seedCeramicQuarter(c, log = () => {}) {
  let accounts = await c.get('/api/accounts');
  const acc = (code) => { const a = accounts.find((x) => x.code === code); if (!a) throw new Error('no account ' + code); return a.id; };
  const add = async (code, en, ar, type, subtype, parent) => { await c.post('/api/accounts', { code, nameEn: en, nameAr: ar, type, subtype, parentId: acc(parent) }); accounts = await c.get('/api/accounts'); };
  await add('1250', 'Kilns, presses and glazing lines', 'الأفران والمكابس وخطوط التزجيج', 'asset', 'fixed_asset', '12');
  await add('1240', 'Factory buildings', 'مباني المصنع', 'asset', 'fixed_asset', '12');
  await add('3900', 'Opening balances (clearing)', 'أرصدة افتتاحية (حساب وسيط)', 'equity', 'equity', '3');
  await add('5235', 'Natural gas for the kilns', 'غاز طبيعي للأفران', 'expense', 'operating_expense', '52');
  const A = { cash: acc('1110'), bank: acc('1120'), building: acc('1240'), kilns: acc('1250'), accDep: acc('1290'), capital: acc('3100'), retained: acc('3200'), opening: acc('3900'),
    sales: acc('4100'), salaries: acc('5210'), utilities: acc('5230'), gas: acc('5235'), maintenance: acc('5280'), transport: acc('5270'), depreciation: acc('5290') };
  const VAT = (await c.get('/api/taxes')).find((t) => t.code === 'VAT').id;

  const wh = {
    rm: (await c.post('/api/inventory/warehouses', { code: 'RM', nameEn: 'Raw materials yard', nameAr: 'ساحة الخامات' })).id,
    // the finished tiles live in the company's main warehouse: the one a new invoice proposes
    fg: (await c.get('/api/inventory/warehouses')).find((w) => w.code === 'MAIN').id,
  };
  const cat = {
    rm: (await c.post('/api/item-categories', { nameEn: 'Raw materials', nameAr: 'خامات' })).id,
    fg: (await c.post('/api/item-categories', { nameEn: 'Tiles', nameAr: 'بلاط' })).id,
  };
  const item = {};
  for (const m of MATERIALS) item[m.sku] = (await c.post('/api/items', { sku: m.sku, nameEn: m.en, nameAr: m.ar, kind: 'product', unit: m.unit, purchasePrice: E(m.price), categoryId: cat.rm, purchaseTaxId: VAT })).id;
  for (const p of PRODUCTS) item[p.sku] = (await c.post('/api/items', { sku: p.sku, nameEn: p.en, nameAr: p.ar, kind: 'product', unit: 'm2', salePrice: E(p.price), categoryId: cat.fg, incomeAccountId: A.sales, salesTaxId: VAT, minSalePrice: E(p.price * 0.85) })).id;
  const party = {};
  for (const x of CUSTOMERS) party[x.code] = (await c.post('/api/parties', { kind: 'customer', code: x.code, name: x.alt, nameAlt: x.name, city: x.city, country: 'Egypt', paymentTermsDays: x.terms, creditLimit: E(40_000_000), notes: 'Sample data: an invented distributor.' })).id;
  for (const x of SUPPLIERS) party[x.code] = (await c.post('/api/parties', { kind: 'supplier', code: x.code, name: x.alt, nameAlt: x.name, city: 'Cairo', country: 'Egypt', paymentTermsDays: x.terms, notes: 'Sample data: an invented supplier.' })).id;
  log('master data');

  // fixed assets and the opening balance sheet on 1 July
  const catOf = async (en, ar, asset, life) => (await c.post('/api/assets/categories', { nameEn: en, nameAr: ar, assetAccountId: asset, accumAccountId: A.accDep, expenseAccountId: A.depreciation, lifeMonths: life })).id;
  const cK = await catOf('Kilns and lines', 'الأفران والخطوط', A.kilns, 120), cB = await catOf('Buildings', 'المباني', A.building, 480);
  const assets = [['الفرن الرولر ١١٠ متر وخط المكبس', cK, 64_000_000, 30, 120], ['خطوط التزجيج والفرز', cK, 22_000_000, 30, 120], ['عنابر المصنع والمخزن', cB, 48_000_000, 60, 480]];
  let assetCost = 0, assetAcc = 0, kilnCost = 0, bldCost = 0;
  for (const [name, categoryId, cost, used, life] of assets) {
    const accumulated = Math.round((cost * used) / life);
    await c.post('/api/assets', { name, categoryId, acquisitionDate: '2024-01-01', startDate: '2026-07-01', cost: E(cost), residual: 0, lifeMonths: life, method: 'straight_line', openingAccumulated: E(accumulated), openingMonths: used, location: 'Factory' });
    assetCost += E(cost); assetAcc += E(accumulated); if (categoryId === cK) kilnCost += E(cost); else bldCost += E(cost);
  }
  const unitCost = {};
  for (const m of MATERIALS) unitCost[m.sku] = m.price;
  for (const p of PRODUCTS) unitCost[p.sku] = p.bom.reduce((s, [sku, q]) => s + (unitCost[sku] * q) / 100, 0) + (p.hours / 100) * 420;
  for (const [w, lines] of [[wh.rm, [['RM-CLAY', 600_000], ['RM-FELD', 130_000], ['RM-GLZ', 26_000], ['PK-CTN', 22_000]]], [wh.fg, [['TL-6060-WHT', 6_000], ['TL-6060-BEG', 4_000], ['TL-3060-WAL', 3_000]]]]) {
    await c.post('/api/inventory/operations', { kind: 'opening', date: '2026-07-01', warehouseId: w, counterAccountId: A.opening, reference: 'OPEN-Q3', memo: 'Stock counted on 30 June 2026',
      lines: lines.map(([sku, q]) => ({ itemId: item[sku], qty: q * Q, unitCost: E(unitCost[sku]) })), post: true });
  }
  const tb = await c.get('/api/reports/trial-balance?from=2026-07-01&to=2026-07-01');
  const ob = tb.rows.find((r) => r.id === A.opening);
  const stockCredit = ob ? ob.closing_credit - ob.closing_debit : 0;
  const lines = [
    { accountId: A.kilns, debit: kilnCost }, { accountId: A.building, debit: bldCost }, { accountId: A.accDep, credit: assetAcc },
    { accountId: A.bank, debit: E(18_500_000), description: 'Current account' }, { accountId: A.cash, debit: E(150_000), description: 'Petty cash' },
    { accountId: A.opening, debit: stockCredit, description: 'Clears the opening stock count' }, { accountId: A.capital, credit: E(95_000_000), description: 'Paid-up capital' },
  ].map((l) => ({ debit: 0, credit: 0, ...l }));
  const diff = lines.reduce((s, l) => s + l.debit - l.credit, 0);
  lines.push({ accountId: A.retained, debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0, description: 'Retained earnings brought forward' });
  await c.post('/api/journal', { date: '2026-07-01', reference: 'OPEN-Q3', memo: 'Opening balances on 1 July 2026', opening: true, post: true, lines });
  log('opening balances');

  // production standards
  await c.put('/api/mfg/settings', { budgetFixedOverhead: E(1_900_000), overheadAccounts: [A.utilities, A.gas, A.maintenance, A.depreciation] });
  const bom = {};
  for (const p of PRODUCTS) bom[p.sku] = (await c.post('/api/mfg/boms', { itemId: item[p.sku], name: `${p.en} — per 100 m²`, outputQty: 100 * Q, labourHours: p.hours * Q,
    labourRate: E(120), varOverheadRate: E(180), fixedOverheadRate: E(120), lines: p.bom.map(([sku, q]) => ({ itemId: item[sku], qty: q * Q, scrapBp: 0 })) })).id;

  const doc = async (body) => (await c.post('/api/documents', { post: true, ...body })).id;
  const settle = async (code, direction, asOf, date) => {
    const role = direction === 'in' ? 'customer' : 'supplier';
    const open = await c.get(`/api/payments/open-documents?partyId=${party[code]}&direction=${direction}&role=${role}`);
    for (const d of open.filter((x) => (x.due_date ?? x.date) <= asOf)) {
      await c.post('/api/payments', { direction, date, partyId: party[code], partyRole: role, accountId: A.bank, amount: d.outstanding, method: 'bank_transfer', reference: `${direction === 'in' ? 'RCV' : 'PAY'}-${d.number}`, post: true, allocations: [{ documentId: d.id, amount: d.outstanding }] });
    }
  };

  for (let m = 0; m < MONTHS.length; m++) {
    const ym = MONTHS[m]; const d = (day) => `${ym}-${String(Math.min(day, lastDay(ym))).padStart(2, '0')}`;
    const last = m === MONTHS.length - 1;
    // 1. raw materials for the month's plan, on credit
    const need = (sku) => PRODUCTS.reduce((s, p) => s + (p.perMonth[m] / 100) * (p.bom.find((b) => b[0] === sku)?.[1] ?? 0), 0);
    for (const sup of ['S-CLAY', 'S-GLAZE', 'S-PACK']) {
      const ls = MATERIALS.filter((x) => x.supplier === sup).map((x) => ({ itemId: item[x.sku], quantity: Math.round(need(x.sku) * 1.02) * Q, unitPrice: E(x.price), taxId: VAT, warehouseId: wh.rm }));
      await doc({ kind: 'purchase_bill', partyId: party[sup], date: d(3), dueDate: addDays(d(3), SUPPLIERS.find((s) => s.code === sup).terms), reference: `${sup}-${ym}`, warehouseId: wh.rm, lines: ls });
    }
    // 2. production: two orders per product a month (the 12th and the 26th)
    for (const p of PRODUCTS) {
      for (const [m2, day] of [[Math.floor(p.perMonth[m] / 2), 12], [p.perMonth[m] - Math.floor(p.perMonth[m] / 2), 26]]) {
        const order = (await c.post('/api/mfg/orders', { bomId: bom[p.sku], plannedQty: m2 * Q, date: d(day - 5), warehouseId: wh.rm, outputWarehouseId: wh.fg, notes: `${p.en} — ${ym}` })).id;
        await c.put(`/api/mfg/orders/${order}`, { date: d(day), warehouseId: wh.rm, outputWarehouseId: wh.fg, outputQty: m2 * Q, labourHours: Math.round((m2 / 100) * p.hours * 1.02 * Q), labourCost: E(Math.round((m2 / 100) * p.hours * 1.02 * 120)),
          lines: p.bom.map(([sku, q]) => ({ itemId: item[sku], qty: Math.round((m2 / 100) * q * 1.01) * Q })) });
        await c.post(`/api/mfg/orders/${order}/complete`);
      }
    }
    // 3. sales: each distributor twice a month
    for (const [half, day] of [[0, 14], [1, 28]]) {
      for (const x of CUSTOMERS) {
        if (last && half === 1 && x.code === 'C-DELTA') continue; // the film invoices Delta at the end of September
        const ls = PRODUCTS.map((p) => ({ itemId: item[p.sku], quantity: Math.floor((p.perMonth[m] * 0.96 * x.share) / 2) * Q, unitPrice: E(p.price), taxId: VAT, warehouseId: wh.fg }));
        await doc({ kind: 'sales_invoice', partyId: party[x.code], date: d(day), dueDate: addDays(d(day), x.terms), reference: `SO-${x.code}-${ym}-${half + 1}`, warehouseId: wh.fg, lines: ls });
      }
    }
    // 4. energy, maintenance, transport (bills) and salaries (journal)
    const out = PRODUCTS.reduce((s, p) => s + p.perMonth[m], 0);
    await doc({ kind: 'purchase_bill', partyId: party['S-GAS'], date: d(25), dueDate: d(30), reference: `GAS-${ym}`, lines: [{ description: 'Natural gas for the kilns', quantity: Q, unitPrice: E(Math.round(out * 34)), accountId: A.gas, taxId: VAT }] });
    await doc({ kind: 'purchase_bill', partyId: party['S-POWER'], date: d(25), dueDate: d(30), reference: `PWR-${ym}`, lines: [{ description: 'Electricity: presses, mills, lines', quantity: Q, unitPrice: E(Math.round(out * 21)), accountId: A.utilities, taxId: VAT }] });
    await doc({ kind: 'purchase_bill', partyId: party['S-MAINT'], date: d(20), dueDate: addDays(d(20), 30), reference: `MNT-${ym}`, lines: [{ description: 'Kiln rollers and press maintenance', quantity: Q, unitPrice: E(m === 1 ? 640_000 : 380_000), accountId: A.maintenance, taxId: VAT }] });
    await c.post('/api/journal', { date: d(28), reference: `SAL-${ym}`, memo: `Salaries ${ym}`, post: true, lines: [{ accountId: A.salaries, debit: E(2_350_000), credit: 0 }, { accountId: A.bank, debit: 0, credit: E(2_350_000) }] });
    await c.post('/api/journal', { date: d(29), reference: `TRN-${ym}`, memo: `Delivery trucks to distributors ${ym}`, post: true, lines: [{ accountId: A.transport, debit: E(Math.round(out * 6)), credit: 0 }, { accountId: A.bank, debit: 0, credit: E(Math.round(out * 6)) }] });
    // 5. collections and payments that fall due; depreciation of the month
    const asOf = d(30);
    for (const x of CUSTOMERS) if (!(last && x.code === 'C-DELTA')) await settle(x.code, 'in', asOf, asOf); // Delta's August invoice is collected on camera
    for (const s of SUPPLIERS) await settle(s.code, 'out', asOf, asOf);
    if (!last) await c.post('/api/assets/depreciation/run', { month: ym });
    log(`month ${ym}`);
  }
  return { party, item, wh, A, VAT };
}
