// The importer must refuse bad files, naming the file and line (a check that cannot fail proves nothing), and accept the shipped templates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, readTable } from './csv.mjs';
import { loadFolder, validate } from './masters.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const templates = () => loadFolder(join(here, 'templates'));
/** The shipped templates with one file replaced by `rows` (header first). */
const withFile = (name, text) => loadFolder('x', (n) => (n === `${name}.csv` ? text : readFileSync(join(here, 'templates', n), 'utf8')));
const messages = (r) => r.problems.map((p) => `${p.file}:${p.line} ${p.message}`);

test('csv: quotes, doubled quotes, semicolons, a byte-order mark and blank lines', () => {
  const rows = parseCsv('﻿a;b;c\r\n1;"x;y";"he said ""hi"""\r\n\r\n2;;3\r\n');
  assert.deepEqual(rows.map((r) => r.cells), [['a', 'b', 'c'], ['1', 'x;y', 'he said "hi"'], ['2', '', '3']]);
  assert.deepEqual(rows.map((r) => r.line), [1, 2, 4]);
  assert.deepEqual(readTable('Item Code,Qty Per\nA,1').columns, ['item_code', 'qty_per']);
});

test('the shipped templates are accepted without errors or warnings', () => {
  const r = validate(templates());
  assert.deepEqual(messages(r), []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.model.items.length, 5);
  // the default rule: the first, the last and the operation that scans a part are mandatory; here all three are
  assert.deepEqual(r.model.routings.get('RC-1').map((o) => o.isMandatory), [true, false, true]);
});

test('every kind of mistake is named with its file and line', () => {
  const cases = [
    ['items', 'code,name_en,type,uom\nA,Item A,raw,EA\nA,Again,raw,EA\n', /items\.csv:3 item "A" appears twice \(first on line 2\)/],
    ['items', 'code,name_en,type,uom\nA,Item A,gadget,EA\n', /items\.csv:2 type "gadget" must be one of raw, semi, finished/],
    ['items', 'code,name_en,type,uom\nA,,raw,EA\n', /items\.csv:2 name_en is required/],
    ['items', 'code,name_en,type,uom,supplier_code\nA,Item A,raw,EA,S-NOPE\n', /items\.csv:2 supplier_code "S-NOPE" is not in parties\.csv/],
    ['items', 'code,name_en,type,uom,lot_rule\nA,Item A,raw,EA,multiple\n', /items\.csv:2 lot_rule multiple needs a lot_size above 0/],
    ['items', 'code,name_en,type,uom,moq\nA,Item A,raw,EA,lots\n', /items\.csv:2 moq "lots" must be a number from 0/],
    ['items', 'code,name_en\nA,Item A\n', /items\.csv:1 the column "type" is missing/],
    ['parties', 'kind,name\nsupplier,Acme\nsupplier,Acme\n', /parties\.csv:3 supplier "Acme" appears twice/],
    ['parties', 'kind,name\nvendor,Acme\n', /parties\.csv:2 kind "vendor" must be one of supplier, customer/],
    ['plant', 'code,type,parent,name\nP1,plant,,P\nL1,line,P1,Line\n', /plant\.csv:3 a line belongs to a area, not to a plant/],
    ['plant', 'code,type,parent,name\nP1,plant,,P\nA,area,P1,A\nL1,line,A,L\nTEST,station,L1,T\n', /plant\.csv:5 station "TEST" must be named <line>-<operation>/],
    ['plant', 'code,type,parent,name\nA,area,NOPE,A\n', /plant\.csv:2 parent "NOPE" is not in plant\.csv/],
    ['routings', 'item,seq,op\nGHOST,10,ASM\n', /routings\.csv:2 item "GHOST" is not in items\.csv/],
    ['routings', 'item,seq,op,kind\nRC-1,10,ASM,work\nRC-1,10,TEST,test\nRC-1,30,PACK,pack\n', /routings\.csv:3 RC-1: operation sequence 10 is used twice/],
    ['routings', 'item,seq,op,kind\nRC-1,10,ASM,pack\nRC-1,20,TEST,test\n', /routings\.csv:2 RC-1: packing \(ASM\) must be the last operation/],
    ['routings', 'item,seq,op\nRC-1,ten,ASM\n', /routings\.csv:2 seq "ten" must be a whole number from 1/],
    ['routings', 'item,seq,op\nRC-1,10,FLY\nRC-1,20,TEST\nRC-1,30,PACK\n', /routings\.csv:2 RC-1: operation FLY needs a station L1-FLY in plant\.csv/],
    ['boms', 'item,component,qty_per,op,scan\nRC-1,NOPE,1,ASM,lot\n', /boms\.csv:2 component "NOPE" is not in items\.csv/],
    ['boms', 'item,component,qty_per,op,scan\nRC-1,PCB-R,0,ASM,lot\n', /boms\.csv:2 qty_per must be above 0/],
    ['boms', 'item,component,qty_per,op,scan\nRC-1,PCB-R,0.0005,ASM,lot\n', /boms\.csv:2 qty_per 0\.0005 has more than 3 decimals/],
    ['boms', 'item,component,qty_per,op,scan\nRC-1,PCB-R,1,ASM,lot\nRC-1,PCB-R,2,ASM,lot\n', /boms\.csv:3 PCB-R is listed twice in the bill of RC-1/],
    ['boms', 'item,component,qty_per,op,scan\nRC-1,PCB-R,1,WELD,lot\n', /boms\.csv:2 RC-1: operation "WELD" is not in its routing/],
    ['boms', 'item,component,qty_per,op,scan\nRC-1,PCB-R,1,,lot\n', /boms\.csv:2 RC-1: PCB-R needs op/],
    ['boms', 'item,component,qty_per,op,scan\nRC-1,PCB-R,1,ASM,barcode\n', /boms\.csv:2 scan "barcode" must be one of serial, lot, none/],
    ['boms', 'item,component,qty_per,op,scan\nRC-1,RC-1,1,ASM,lot\n', /boms\.csv:2 RC-1 cannot contain itself/],
  ];
  for (const [file, text, expected] of cases) {
    const found = messages(validate(withFile(file, text)));
    assert.ok(found.some((m) => expected.test(m)), `${file}: expected ${expected} in ${JSON.stringify(found)}`);
  }
});

test('a circular bill of materials is refused', () => {
  const items = 'code,name_en,type,uom,procurement\nA,A,semi,EA,make\nB,B,semi,EA,make\nC,C,semi,EA,make\n';
  const boms = 'item,component,qty_per,op\nA,B,1,\nB,C,1,\nC,A,1,\n';
  const t = loadFolder('x', (n) => ({ 'items.csv': items, 'boms.csv': boms }[n] ?? null));
  assert.ok(messages(validate(t)).some((m) => /circular bill of materials: A > B > C > A/.test(m)));
});

test('serial scan of a part that is not serial-tracked becomes a lot scan, with a warning; a lot scan of an untracked part warns', () => {
  const r = validate(withFile('boms', 'item,component,qty_per,op,scan\nRC-1,PCB-R,1,ASM,serial\nRC-1,BATCOV,1,ASM,lot\n'));
  assert.deepEqual(messages(r), []);
  assert.ok(r.warnings.some((w) => /PCB-R is scanned by serial but tracked as lot: it is scanned by lot instead/.test(w.message)));
  assert.ok(r.warnings.some((w) => /BATCOV is scanned by lot but not lot-tracked/.test(w.message)));
  assert.equal(r.model.boms.get('RC-1')[0].scan, 'lot');
});

test('missing files are skipped, an empty folder has nothing to check', () => {
  const r = validate(loadFolder('x', () => null));
  assert.deepEqual(r.problems, []);
  assert.equal(r.model.items.length, 0);
});
