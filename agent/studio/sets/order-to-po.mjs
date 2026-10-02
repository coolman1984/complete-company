// The film set of "from the customer's order to the purchase order": the demo ceramic company («شركة السيراميك التجريبية»,
// invented) with Mizan and Itqan running in the shoot's own process, paired, on a studio clock; the tile line, its routing and
// its bill of materials known to Itqan; four raw materials with their lead times in Mizan; two suppliers.
// Everything off camera goes through the applications' own APIs (the way the scenario engine does). What the film shows on
// camera is done in the screens. The numbers are the ceramic pitch's (plan 60): 1,440 m² order, 18 kg clay, 4 kg feldspar,
// 0.8 kg glaze and 0.7 carton per m².
import { join } from 'node:path';
import { host } from '../../../scenario/engine/host.mjs';
import { pair } from '../../../portal/pair.mjs';

export const ORDER_M2 = 1440;
export const BOM = { 'CLAY-RED': '18', FELDSPAR: '4', 'GLZ-WHT': '0.8', 'CTN-60': '0.7' };
export const NEED = { 'CLAY-RED': 25920, FELDSPAR: 5760, 'GLZ-WHT': 1152, 'CTN-60': 1008 };
const LINE = 'L1', OPS = ['PR', 'DR', 'GL', 'KL', 'SP'];
const U = 1000;

export async function buildWorld({ root, out, startDay }) {
  const h = await host({ root, out, startDay, hr: false, locale: 'ar', mizanWeb: join(root, 'Accounting-sys', 'apps', 'web', 'dist'),
    company: { name: 'شركة السيراميك التجريبية', code: 'DCER' } });
  const { mizan: mz, gmes: gm } = h.clients;
  h.clock.at(startDay, '08:30');
  let n = 0;
  const cmd = (p = 'f4') => `${p}-${Date.now().toString(36)}-${(++n).toString(36)}`;
  const pump = async (k = 3) => { for (let i = 0; i < k; i++) { await mz('POST', '/api/eco/sync'); await gm('POST', '/api/eco/push'); } };
  const day = (add = 0) => { const d = new Date(startDay + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + add); return d.toISOString().slice(0, 10); };

  // ---- Mizan: two suppliers, the distributor, the four materials (each with its supplier and lead time) and the tile
  const clayCo = (await mz('POST', '/api/parties', { kind: 'supplier', code: 'S-CLAY', name: 'أسوان للطفلة والخامات', nameAlt: 'Aswan Clay & Minerals', paymentTermsDays: 30 })).id;
  const glazeCo = (await mz('POST', '/api/parties', { kind: 'supplier', code: 'S-GLAZE', name: 'الفريت والجليز للتوريدات', nameAlt: 'Frit & Glaze Supplies', paymentTermsDays: 45 })).id;
  const customer = (await mz('POST', '/api/parties', { kind: 'customer', code: 'C-DELTA', name: 'الدلتا لمواد البناء (موزع)', nameAlt: 'Delta Building Materials (distributor)', paymentTermsDays: 30 })).id;
  const item = (o) => mz('POST', '/api/items', { kind: 'product', ...o }).then((r) => r.id);
  const raw = (o) => item({ tracking: 'batch', materialType: 'raw', procurementType: 'buy', ...o });
  const clay = await raw({ sku: 'CLAY-RED', nameEn: 'Red clay', nameAr: 'طفلة حمراء', unit: 'KG', leadTimeDays: 7, purchasePrice: 150, defaultSupplierId: clayCo });
  const feldspar = await raw({ sku: 'FELDSPAR', nameEn: 'Feldspar', nameAr: 'فلسبار', unit: 'KG', leadTimeDays: 7, purchasePrice: 300, defaultSupplierId: clayCo });
  const glaze = await raw({ sku: 'GLZ-WHT', nameEn: 'White glaze', nameAr: 'جليز أبيض', unit: 'KG', leadTimeDays: 10, purchasePrice: 4500, defaultSupplierId: glazeCo });
  const carton = await raw({ sku: 'CTN-60', nameEn: 'Carton 60x60 (1.44 m2)', nameAr: 'كرتونة ٦٠×٦٠', unit: 'PCS', leadTimeDays: 5, purchasePrice: 1200, defaultSupplierId: glazeCo });
  const tile = await item({ sku: 'TL-6060-WHT', nameEn: 'Porcelain tile 60x60 white, 1st grade', nameAr: 'بورسلين ٦٠×٦٠ أبيض فرز أول', unit: 'M2', tracking: 'batch', materialType: 'finished', procurementType: 'make', salePrice: 32000 });

  // ---- pairing, then Itqan's engineering: the line, its routing and bill of materials, the crew
  const paired = await pair({ urls: h.urls, logins: h.logins });
  if (!paired.ok) throw new Error('pairing failed: ' + JSON.stringify(paired.steps.filter((s) => !s.ok)));
  await pump();
  const gid = Object.fromEntries((await gm('GET', '/api/items')).map((i) => [i.code, i.id]));
  const plant = await gm('POST', '/api/plant', { code: 'CP1', type: 'plant', nameEn: 'Tile plant', nameAr: 'مصنع البلاط' });
  const area = await gm('POST', '/api/plant', { code: 'FL', type: 'area', parentId: plant.id, nameEn: 'Floor tiles', nameAr: 'بلاط الأرضيات' });
  const line = await gm('POST', '/api/plant', { code: LINE, type: 'line', parentId: area.id, nameEn: 'Tile line 1', nameAr: 'خط البلاط ١', capacityPerShift: 2500 });
  const opName = { PR: ['Pressing', 'المكبس'], DR: ['Drying', 'المجفف'], GL: ['Glazing', 'التزجيج'], KL: ['Kiln firing', 'الفرن'], SP: ['Sorting and packing', 'الفرز والتعبئة'] };
  for (const op of OPS) await gm('POST', '/api/plant', { code: `${LINE}-${op}`, type: 'station', parentId: line.id, nameEn: opName[op][0], nameAr: opName[op][1] });
  await gm('PUT', '/api/production-shifts/A', { nameEn: 'Day', start: '07:00', end: '15:00', breakMin: 40 });
  await gm('PUT', '/api/production-shifts/B', { nameEn: 'Evening', start: '15:00', end: '23:00', breakMin: 40 });
  const route = await gm('POST', '/api/routings', { itemId: gid['TL-6060-WHT'], operations: OPS.map((op, i) => ({ seq: (i + 1) * 10, code: op, nameEn: opName[op][0], ...(op === 'SP' ? { kind: 'pack' } : {}) })) });
  await gm('POST', `/api/routings/${route.id}/approve`, { version: (await gm('GET', `/api/routings/${route.id}`)).version });
  const opOf = { 'CLAY-RED': 'PR', FELDSPAR: 'PR', 'GLZ-WHT': 'GL', 'CTN-60': 'SP' };
  const bom = await gm('POST', '/api/boms', { itemId: gid['TL-6060-WHT'], lines: Object.entries(BOM).map(([code, qtyPer]) => ({ componentId: gid[code], qtyPer, opCode: opOf[code], scan: 'lot' })) });
  await gm('POST', `/api/boms/${bom.id}/approve`, { version: (await gm('GET', `/api/boms/${bom.id}`)).version });
  // incoming inspection: clay and glaze are inspected on arrival, feldspar and cartons are usable at once
  await gm('POST', '/api/qms/plans', { code: 'IQC-CLAY', nameEn: 'Incoming clay (moisture, residue)', stage: 'iqc', itemId: gid['CLAY-RED'], aql: '2.5' });
  await gm('POST', '/api/qms/plans', { code: 'IQC-GLZ', nameEn: 'Incoming glaze (shade, viscosity)', stage: 'iqc', itemId: gid['GLZ-WHT'], aql: '0.65' });
  await gm('PUT', '/api/pln/item-lines', { itemId: gid['TL-6060-WHT'], lines: [LINE] });
  for (const op of OPS) await gm('PUT', '/api/pln/crew-settings', { node: `${LINE}-${op}`, crew: op === 'SP' ? 4 : 2 });
  await pump();

  return {
    h, mz, gm, cmd, pump, day, ids: { clayCo, glazeCo, customer, clay, feldspar, glaze, carton, tile }, gid,
    /** The distributor's order, entered in Mizan (it has no order screen yet: the order API is what a salesperson's tool calls). */
    async placeOrder() {
      const so = await mz('POST', '/api/sales/orders', { customerId: customer, orderDate: day(), confirm: true, lines: [{ itemId: tile, quantity: ORDER_M2 * U, requestedDate: day(21) }] });
      const view = await mz('GET', `/api/sales/orders/${so.id}`);
      await pump();
      return view;
    },
    stop: () => h.stop(),
  };
}
