// Silinx schematic -> ISE schematic (core/isesch-export.js, #405: out of isesch.js): isesch.js still exports the
// module's functions; the ISE timestamp; a sheet with a library gate and a Silinx-only symbol: the library symbol by
// its ISE name, the other as an xl_… symbol whose name decodes back to its type and parameters, with its .sym and HDL
// files and the warning that says to add them; the result read back by importIseSch, the same symbols.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportIseSch, decodeXlSymbol, iseTimestamp } from '../core/isesch-export.js';
import * as isesch from '../core/isesch.js';
import { normalizeDoc } from '../core/schdoc.js';

test('#405 ISE schematic export: isesch.js exports the module\'s functions; the timestamp', () => {
  assert.equal(isesch.exportIseSch, exportIseSch);
  assert.equal(isesch.decodeXlSymbol, decodeXlSymbol);
  assert.equal(isesch.iseTimestamp, iseTimestamp);
  assert.equal(iseTimestamp(new Date(2024, 0, 2, 3, 4, 5)), '2024-1-2T3:4:5');
});

test('#405 ISE schematic export: a library gate and a Silinx-only symbol, its files, read back', () => {
  const doc = normalizeDoc({ name: 't', lang: 'vhdl', symbols: [{ id: 'S1', type: 'mux4', name: 'U1', x: 200, y: 100, params: { width: 4 } },
    { id: 'S2', type: 'and2', name: 'U2', x: 400, y: 100 }], ports: [], wires: [], labels: [] });
  const r = exportIseSch(doc, { timestamp: 'T' });
  assert.match(r.xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<drawing version="7">/);
  assert.deepEqual([...r.xml.matchAll(/<block symbolname="([^"]+)"/g)].map((m) => m[1]), ['xl_mux4_w4', 'and2']);
  assert.deepEqual(r.files.map((f) => [f.path, f.kind]), [['xl_mux4_w4.sym', 'sym'], ['xl_mux4_w4.vhd', 'hdl']]);
  assert.deepEqual(r.warnings, ['ISE symbols not in the Xilinx library: xl_mux4_w4 — add the returned HDL (.vhd) and .sym files to the ISE project']);
  assert.deepEqual(decodeXlSymbol('xl_mux4_w4'), { type: 'mux4', params: { width: 4, en: false, selBus: true } });
  assert.equal(decodeXlSymbol('and2'), null);
  // read back: the same symbols, the Silinx-only one recognised by its name
  const symbols = Object.fromEntries(r.files.filter((f) => f.kind === 'sym').map((f) => [f.path, f.text]));
  const back = isesch.importIseSch(r.xml, { name: 't', symbols });
  assert.deepEqual(back.doc.symbols.map((s) => [s.type, s.name]).sort(), [['and2', 'U2'], ['mux4', 'U1']]);
  assert.equal(back.doc.symbols.find((s) => s.type === 'mux4').params.width, 4);
});
