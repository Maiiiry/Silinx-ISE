// The parts of an ASM chart made from HDL (#405: out of core/asm-from-hdl.js): the per-state decision trees
// (asm-trees.js), the structural comparison (asm-same.js) and asmFromHdl's text candidates (asm-candidates.js);
// asm-from-hdl.js still exports sameAsmStructure. The new chart's VHDL and Verilog read back as the same chart; with
// no generator header, the previous chart's spelling of a condition is kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as asm from '../core/asm.js';
import { generate } from '../core/asm-gen.js';
import * as afh from '../core/asm-from-hdl.js';
import { sameAsmStructure } from '../core/asm-same.js';
import { makeTreeBuilder, mergeTrees } from '../core/asm-trees.js';
import { mountTextCandidates } from '../core/asm-candidates.js';

const chart = lang => asm.normalizeModel(asm.newModel('ctl', lang));
const conds = m => m.nodes.filter(n => n.type === 'decision').map(n => n.cond);

test('#405 ASM from HDL parts: the modules\' functions; asm-from-hdl.js exports sameAsmStructure', () => {
  assert.equal(afh.sameAsmStructure, sameAsmStructure);
  for (const f of [makeTreeBuilder, mergeTrees, mountTextCandidates]) assert.equal(typeof f, 'function');
});

test('#405 ASM from HDL parts: the new chart\'s VHDL and Verilog read back as the same chart, no warning', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const m = chart(lang);
    const r = afh.asmFromHdl(generate(m, lang).code, { path: `ctl.${lang === 'vhdl' ? 'vhd' : 'v'}` });
    assert.deepEqual(r.warnings, [], lang);
    assert.ok(sameAsmStructure(r.model, m), lang);
    assert.deepEqual(conds(r.model), ['start', 'done'], lang);
  }
});

test('#405 ASM from HDL parts: with no generator header, the previous chart\'s spelling of a condition kept', () => {
  const m = chart('vhdl');
  const code = generate(m, 'vhdl').code.split('\n').filter(l => !l.startsWith('--')).join('\n');
  assert.deepEqual(conds(afh.asmFromHdl(code, { path: 'ctl.vhd' }).model), ['start', 'done']);
  const previous = { ...m, nodes: m.nodes.map(n => (n.type === 'decision' && n.cond === 'start' ? { ...n, cond: 'start = 1' } : n)) };
  assert.deepEqual(conds(afh.asmFromHdl(code, { path: 'ctl.vhd', previous }).model), ['start = 1', 'done']);
});
