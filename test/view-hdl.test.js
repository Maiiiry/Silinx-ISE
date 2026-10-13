// core/view-hdl.js: the module a drawn source is synchronized with among the modules of its HDL file
// (a schematic's blocks, #175, are not the drawing, #207), and the HDL file every drawn source gets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawnModule, drawnHdlPath, viewHdl } from '../core/view-hdl.js';
import { newDoc } from '../core/schdoc.js';
import { newModel } from '../core/asm.js';
import { newPetri } from '../core/petri.js';
import { newTable } from '../core/logic.js';

test('drawnModule: the module named as the drawing, never the blocks of its HDL', () => {
  // esq.vhd made from esq.sch.json: the decoder block esq_d2_4e is an entity of its own, instanced
  const mods = [{ name: 'esq_d2_4e', instances: [] }, { name: 'esq', instances: ['esq_d2_4e'] }];
  assert.equal(drawnModule(mods, 'esq'), 'esq');
  assert.equal(drawnModule(mods, 'ESQ'), 'esq');   // (VHDL: the letter case does not count)
  // the drawing named otherwise (renamed): the module no other module of the file instances
  assert.equal(drawnModule(mods, 'other'), 'esq');
  assert.equal(drawnModule([{ name: 'a', instances: [] }, { name: 'b', instances: [] }], 'c'), null);
  assert.equal(drawnModule([], 'esq'), null);
});

test('drawnHdlPath: the HDL file next to the drawing, named after its module', () => {
  assert.equal(drawnHdlPath('src/x.sch.json', 'x', 'vhdl'), 'src/x.vhd');
  assert.equal(drawnHdlPath('src/sub/ctl.pn.json', 'ctl', 'verilog'), 'src/sub/ctl.v');
  assert.equal(drawnHdlPath('x.asm.json', 'x', 'vhdl'), 'src/x.vhd');
});

test('a new drawing of every kind makes its HDL with no errors (its HDL file at once, #207)', () => {
  const docs = {
    'src/gate.sch.json': newDoc('gate', 'vhdl'),
    'src/ctrl.asm.json': newModel('ctrl', 'vhdl'),
    'src/net.pn.json': newPetri('net', 'vhdl'),
    'src/maj.tt.json': { ...newTable('maj', ['a', 'b', 'c'], ['f']), lang: 'verilog' },
  };
  const got = Object.entries(docs).map(([p, d]) => { const r = viewHdl(p, JSON.stringify(d)); return [r.module, r.errors, drawnHdlPath(p, r.module, r.lang), /^\s*(entity|module) /m.test(r.text)]; });
  assert.deepEqual(got, [
    ['gate', [], 'src/gate.vhd', true],
    ['ctrl', [], 'src/ctrl.vhd', true],
    ['net', [], 'src/net.vhd', true],
    ['maj', [], 'src/maj.v', true],
  ]);
  // linked (generatedFile): its HDL is that file, nothing made here
  assert.equal(viewHdl('src/gate.sch.json', JSON.stringify({ ...docs['src/gate.sch.json'], generatedFile: 'src/gate.vhd' })), null);
});
