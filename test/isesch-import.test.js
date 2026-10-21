// The phases of importIseSch (#405: out of isesch.js), on an ISE schematic of the fixtures (list1.sch: 8 gates and
// flip-flops, 5 ports): the netlist read (core/isesch-nets.js: signals with the ports' names kept, blocks as Silinx
// symbols), the geometry (core/isesch-geometry.js: one macro per block, the coordinate maps), and the assembly
// (core/isesch-assemble.js) through importIseSch: the same symbols, every ISE block pin mapped, no warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readIseNets } from '../core/isesch-nets.js';
import { blockGeometry } from '../core/isesch-geometry.js';
import { assembleIseImport } from '../core/isesch-assemble.js';
import { parseIseSch, importIseSch } from '../core/isesch.js';
import { normModules } from '../core/schdoc.js';

const TEXT = fs.readFileSync(new URL('./fixtures/ise-sch/list1.sch', import.meta.url), 'utf8');

test('#405 ISE schematic import, the netlist read and the geometry', () => {
  const model = parseIseSch(TEXT);
  const warnings = [];
  const modules = normModules({});
  const nets = readIseNets(model, {}, { lang: 'vhdl', modules, docName: 'list1', warn: (m) => warnings.push(m) });
  // the ports keep their ISE names, the ISE automatic nets too; 8 blocks, no bus
  for (const [k, name] of [['clk', 'CLK'], ['y', 'Y'], ['x1', 'X1'], ['xlxn_9', 'XLXN_9']]) assert.equal(nets.keyName.get(k), name, k);
  assert.equal(nets.sigs.size, 19);
  assert.deepEqual(nets.blocks.map((b) => b.spec?.type ?? b.type).sort(), ['and2b2', 'and3b1', 'and3b2', 'fd', 'fd', 'fd', 'fd', 'or3']);
  assert.deepEqual([nets.helpers.length, nets.declLines.length, nets.keyWidth('clk')], [0, 0, 1]);
  const geo = blockGeometry({ ...nets, model, modules, warn: (m) => warnings.push(m) });
  assert.equal(geo.macros.length, 8);
  assert.ok(geo.macros.every((M) => M.syms.length >= 1 && M.ext.length >= 1));
  // the maps keep the order of the ISE coordinates, on the 10-unit grid
  const xs = [100, 400, 2000].map((x) => geo.MX(0, x));
  assert.ok(xs[0] < xs[1] && xs[1] < xs[2], xs.join(' '));
  assert.ok(xs.every((x) => x % 10 === 0));
  assert.deepEqual(warnings, []);
});

test('#405 ISE schematic import, assembled: the symbols, every ISE block pin mapped, no warnings', () => {
  assert.equal(typeof assembleIseImport, 'function');
  const r = importIseSch(TEXT, { name: 'list1' });
  assert.equal(r.doc.symbols.length, 8);
  assert.equal(Object.keys(r.pinMap).length, 27);
  assert.deepEqual([r.warnings, r.unconnected], [[], []]);
  assert.deepEqual(r.doc.ports.map((p) => p.name).sort(), ['CLK', 'X1', 'X2', 'X3', 'Y']);
});
