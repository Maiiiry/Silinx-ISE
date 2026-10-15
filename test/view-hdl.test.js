// core/view-hdl.js: the module a drawn source is synchronized with among the modules of its HDL file
// (a schematic's blocks, #175, are not the drawing, #207), and the HDL file every drawn source gets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { drawnModule, drawnHdlPath, viewHdl, definesModule, freeHdlPath, drawnHdlClash } from '../core/view-hdl.js';
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

// #230: a drawing whose HDL file name is taken
test('definesModule: an entity / a module of that name, not in a comment; VHDL ignores the letter case', () => {
  assert.equal(definesModule('library ieee;\nentity Ctl is\n port (a : in bit);\nend;', 'ctl', 'src/ctl.vhd'), true);
  assert.equal(definesModule('-- entity ctl is\nentity other is end;', 'ctl', 'src/ctl.vhd'), false);
  assert.equal(definesModule('entity ctl2 is end;', 'ctl', 'src/ctl.vhd'), false);
  assert.equal(definesModule('module ctl(input a);\nendmodule', 'ctl', 'src/ctl.v'), true);
  assert.equal(definesModule('module Ctl(input a);\nendmodule', 'ctl', 'src/ctl.v'), false);
  assert.equal(definesModule('/* module ctl; */ // module ctl\nmodule x; endmodule', 'ctl', 'src/ctl.v'), false);
  assert.equal(definesModule(null, 'ctl', 'src/ctl.vhd'), false);
});

test('freeHdlPath: <module>_<kind> next to the drawing, then _2, _3…', () => {
  const taken = new Set(['src/ctl.vhd', 'src/ctl_pn.vhd']);
  assert.equal(freeHdlPath('src/ctl.pn.json', 'ctl', 'vhdl', () => false), 'src/ctl_pn.vhd');
  assert.equal(freeHdlPath('src/ctl.pn.json', 'ctl', 'vhdl', p => taken.has(p)), 'src/ctl_pn_2.vhd');
  assert.equal(freeHdlPath('src/sub/m.tt.json', 'm', 'verilog', () => false), 'src/sub/m_tt.v');
  assert.equal(freeHdlPath('src/a.sch.json', 'a', 'vhdl', () => false), 'src/a_sch.vhd');
  assert.equal(freeHdlPath('src/a.asm.json', 'a', 'vhdl', () => false), 'src/a_asm.vhd');
  assert.equal(freeHdlPath('src/a.fsm.json', 'a', 'vhdl', () => false), 'src/a_fsm.vhd');
});

test('drawnHdlClash: none when the name is free; the file defining the module (to be replaced); a file holding something else (a free name)', () => {
  const files = { 'src/net.vhd': 'entity net is end;', 'src/maj.v': 'module other; endmodule', 'src/maj_tt.v': '// taken' };
  const exists = p => p in files, read = p => files[p] ?? null;
  assert.equal(drawnHdlClash({ path: 'src/free.pn.json', module: 'free', lang: 'vhdl', exists, read }), null);
  assert.equal(drawnHdlClash({ path: 'src/x.pn.json', module: null, lang: 'vhdl', exists, read }), null);
  assert.deepEqual(drawnHdlClash({ path: 'src/net.pn.json', module: 'net', lang: 'vhdl', exists, read }),
    { kind: 'same', path: 'src/net.pn.json', module: 'net', target: 'src/net.vhd', file: 'src/net.vhd' });
  assert.deepEqual(drawnHdlClash({ path: 'src/maj.tt.json', module: 'maj', lang: 'verilog', exists, read }),
    { kind: 'other', path: 'src/maj.tt.json', module: 'maj', target: 'src/maj.v', file: 'src/maj.v', free: 'src/maj_tt_2.v' });
  // its module defined by another HDL file of the project (the file of its name free)
  assert.deepEqual(drawnHdlClash({ path: 'src/g.sch.json', module: 'g', lang: 'vhdl', exists, read, definedIn: 'src/lib.vhd' }),
    { kind: 'same', path: 'src/g.sch.json', module: 'g', target: 'src/g.vhd', file: 'src/lib.vhd' });
});

// #231: a drawing whose HDL file (generatedFile) is gone, deleted or removed from the project
test('viewHdl, linked: a drawing whose HDL file is not in the project is a source without one (its HDL made, `lost` names the file)', () => {
  const pn = { ...newPetri('ctl', 'vhdl'), generatedFile: 'src/ctl.vhd' };
  const bare = viewHdl('src/ctl.pn.json', JSON.stringify(newPetri('ctl', 'vhdl')));
  assert.equal(bare.lost, undefined);
  // the file there: that file, nothing made here (with linked and without)
  assert.equal(viewHdl('src/ctl.pn.json', JSON.stringify(pn), { linked: f => f === 'src/ctl.vhd' }), null);
  assert.equal(viewHdl('src/ctl.pn.json', JSON.stringify(pn)), null);
  // gone: the same HDL as the drawing without the link
  const r = viewHdl('src/ctl.pn.json', JSON.stringify(pn), { linked: () => false });
  assert.deepEqual(r, { ...bare, lost: 'src/ctl.vhd' });
  assert.deepEqual([r.module, r.errors, drawnHdlPath(r.path, r.module, r.lang)], ['ctl', [], 'src/ctl.vhd']);
  // every kind; a drawing that does not say its language: its lost file's (a schematic linked to Verilog)
  const docs = {
    'src/gate.sch.json': [{ ...newDoc('gate', 'vhdl'), lang: undefined, generatedFile: 'src/gate.v' }, 'verilog', 'src/gate.v'],
    'src/ctrl.asm.json': [{ ...newModel('ctrl', 'vhdl'), generatedFile: 'src/ctrl.vhd' }, 'vhdl', 'src/ctrl.vhd'],
    'src/maj.tt.json': [{ ...newTable('maj', ['a', 'b', 'c'], ['f']), lang: 'verilog', generatedFile: 'src/maj_tt.v' }, 'verilog', 'src/maj.v'],
  };
  for (const [p, [d, lang, target]] of Object.entries(docs)) {
    const v = viewHdl(p, JSON.stringify(d), { linked: () => false });
    assert.deepEqual([v.lang, v.errors, v.lost, drawnHdlPath(p, v.module, v.lang)], [lang, [], d.generatedFile, target], p);
    assert.match(v.text, lang === 'verilog' ? /^\s*module /m : /^\s*entity /m, p);
  }
  // not readable: said, as for a drawing without the link
  const bad = viewHdl('src/bad.pn.json', '{ not json', { linked: () => false });
  assert.equal(bad.errors.length, 1);
});

test('server viewSources (implementation): a drawing whose HDL file is deleted or removed from the project is built from the drawing (#231)', async () => {
  const { viewSources } = await import('../server/ise.js');
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'silinx-vh-'));
  try {
    await fsp.mkdir(path.join(dir, 'src'));
    await fsp.writeFile(path.join(dir, 'src/ctl.pn.json'), JSON.stringify({ ...newPetri('ctl', 'vhdl'), generatedFile: 'src/ctl.vhd' }));
    const hdl = viewHdl('src/ctl.pn.json', JSON.stringify(newPetri('ctl', 'vhdl'))).text;
    const files = [{ path: 'src/ctl.vhd', lang: 'vhdl', role: 'design' }];
    // deleted from the folder (still listed in the project)
    let got = await viewSources({ files }, dir, []);
    assert.deepEqual(got.map(r => [r.path, r.module, r.lost, r.text === hdl]), [['src/ctl.pn.json', 'ctl', 'src/ctl.vhd', true]]);
    // in the folder and in the project: that file, nothing made
    await fsp.writeFile(path.join(dir, 'src/ctl.vhd'), hdl);
    assert.deepEqual(await viewSources({ files }, dir, [{ path: 'src/ctl.vhd', lang: 'vhdl', text: hdl }]), []);
    // removed from the project (the file kept in the folder)
    got = await viewSources({ files: [] }, dir, []);
    assert.deepEqual(got.map(r => [r.path, r.lost]), [['src/ctl.pn.json', 'src/ctl.vhd']]);
  } finally { await fsp.rm(dir, { recursive: true, force: true }); }
});
