// The film set of the floor scenes: a ceramic tile line in a GMES that owns its items (no Mizan needed), one work order
// of 1,440 m2 released on line L1 (area CER: the ceramic scrap reasons), its materials issued by lot at the start of the shift.
// { workOrder: false } leaves the order to the film (released from the plan on camera; issue its materials with issueMaterials);
// capacityPerShift sets the line's plan per hour on the boards (capacity / 8).
export async function seedGmes(G, pw = 'Demo-2026!', { workOrder = true, capacityPerShift = 2500 } = {}) {
  let cookie = '';
  const api = async (m, p, b, o = {}) => { const r = await fetch(G + p, { method: m, headers: { 'content-type': 'application/json', origin: G, ...(cookie ? { cookie } : {}) }, body: b === undefined ? (m === 'GET' ? undefined : '{}') : JSON.stringify(b) }); const s = r.headers.get('set-cookie'); if (s && s.startsWith('gmes_sid=')) cookie = s.split(';')[0]; const t = await r.text(); const j = t ? JSON.parse(t) : null; if (!r.ok && !o.allow) throw new Error(`${m} ${p} ${r.status} ${t.slice(0, 300)}`); return j; };
  let n = 0; const cmd = () => 'seed-' + Date.now().toString(36) + '-' + (++n);
  await api('POST', '/api/setup', { login: 'admin', name: 'مدير الإنتاج', password: pw, language: 'ar' });
  await api('POST', '/api/auth/login', { login: 'admin', password: pw });
  const it = async (code, en, ar, uom, tracking = 'lot') => (await api('POST', '/api/items', { code, nameEn: en, nameAr: ar, kind: 'product', tracking, baseUom: uom })).id;
  const id = { CLAY: await it('CLAY-RED', 'Red clay', 'طفلة حمراء', 'KG'), FS: await it('FELDSPAR', 'Feldspar', 'فلسبار', 'KG'), GLZ: await it('GLZ-WHT', 'White glaze', 'جليز أبيض', 'KG'), CTN: await it('CTN-60', 'Carton 60x60', 'كرتونة ٦٠×٦٠', 'PCS'), TILE: await it('TL-6060-WHT', 'Porcelain tile 60x60 white', 'بورسلين ٦٠×٦٠ أبيض فرز أول', 'M2') };
  let wh = (await api('GET', '/api/warehouses'))[0];
  if (!wh) { await api('POST', '/api/warehouses', { code: 'MAIN', nameEn: 'Main warehouse', nameAr: 'المخزن الرئيسي' }); wh = (await api('GET', '/api/warehouses'))[0]; }
  const plant = await api('POST', '/api/plant', { code: 'CP1', type: 'plant', nameEn: 'Tile plant', nameAr: 'مصنع البلاط' });
  const area = await api('POST', '/api/plant', { code: 'CER', type: 'area', parentId: plant.id, nameEn: 'Floor tiles', nameAr: 'بلاط الأرضيات' });
  const line = await api('POST', '/api/plant', { code: 'L1', type: 'line', parentId: area.id, nameEn: 'Tile line 1', nameAr: 'خط البلاط ١', capacityPerShift });
  await api('PUT', '/api/uoms/M2', { nameEn: 'm²', nameAr: 'م²', decimals: 0 }, { allow: true });
  const ops = [['PR', 'Pressing', 'المكبس'], ['DR', 'Drying', 'المجفف'], ['GL', 'Glazing', 'التزجيج'], ['KL', 'Kiln firing', 'الفرن'], ['SP', 'Sorting and packing', 'الفرز والتعبئة']];
  for (const [c, en, ar] of ops) await api('POST', '/api/plant', { code: `L1-${c}`, type: 'station', parentId: line.id, nameEn: en, nameAr: ar });
  const route = await api('POST', '/api/routings', { itemId: id.TILE, operations: ops.map(([c, en], i) => ({ seq: (i + 1) * 10, code: c, nameEn: en, ...(c === 'SP' ? { kind: 'pack' } : {}) })) });
  await api('POST', `/api/routings/${route.id}/approve`, { version: (await api('GET', `/api/routings/${route.id}`)).version });
  const bom = await api('POST', '/api/boms', { itemId: id.TILE, lines: [[id.CLAY, '18', 'PR'], [id.FS, '4', 'PR'], [id.GLZ, '0.8', 'GL'], [id.CTN, '0.7', 'SP']].map(([c, q, op]) => ({ componentId: c, qtyPer: q, opCode: op, scan: 'lot' })) });
  await api('POST', `/api/boms/${bom.id}/approve`, { version: (await api('GET', `/api/boms/${bom.id}`)).version });
  await api('PUT', '/api/stop-reasons/kiln-temp', { commandId: cmd(), name_en: 'Kiln temperature out of range', name_ar: 'حرارة الفرن خارج الحدود', loss: 'breakdown' });
  const issueMaterials = async (woId) => {
    for (const [c, q, lot, op] of [[id.CLAY, '25920', 'CL-2609', 'PR'], [id.FS, '5760', 'FS-2609', 'PR'], [id.GLZ, '1000', 'GZ-2609', 'GL'], [id.CTN, '910', 'CT-2609', 'SP']])
      await api('POST', `/api/work-orders/${woId}/consume`, { commandId: cmd(), itemId: c, qty: q, warehouseId: wh.id, lotNo: lot, station: `L1-${op}` });
  };
  if (!workOrder) return { api, cmd, id, wh, issueMaterials };
  const wo = await api('POST', '/api/work-orders', { commandId: cmd(), itemId: id.TILE, plannedQty: '1440', warehouseId: wh.id, line: 'L1' });
  const woId = wo.id ?? wo.workOrder?.id;
  // the materials were issued at the start of the shift (their lots), so the floor scene starts with the line running
  await issueMaterials(woId);
  return { api, cmd, woId, id, wh, issueMaterials };
}
