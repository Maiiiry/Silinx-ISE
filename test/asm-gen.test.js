// The HDL generators of an ASM chart (core/asm-gen.js, #405: out of asm.js): asm.js still exports them; the VHDL and
// Verilog of a chart, in every encoding, compile and elaborate with no diagnostics (errors or warnings), and the chart
// recovered from them (core/asm-from-hdl.js) is the same chart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as gen from '../core/asm-gen.js';
import * as asm from '../core/asm.js';
import { compile, elaborate } from '../core/compile.js';
import { asmFromHdl, sameAsmStructure } from '../core/asm-from-hdl.js';

test('#405 ASM generators: asm.js exports the module\'s functions', () => {
  for (const f of ['generate', 'generateVhdl', 'generateVerilog', 'extractAlwaysBlocks', 'asmJoinPoints']) assert.equal(asm[f], gen[f], f);
});

test('#405 ASM generators: the VHDL and Verilog of a chart, every encoding: no diagnostics, the same chart recovered', () => {
  for (const lang of ['vhdl', 'verilog']) {
    for (const encoding of asm.ENCODINGS) {
      const m = asm.normalizeModel({ ...asm.newModel('ctl', lang), encoding });
      const g = gen.generate(m, lang);
      assert.deepEqual([g.lang, g.filename], [lang, `ctl.${lang === 'vhdl' ? 'vhd' : 'v'}`], `${lang} ${encoding}`);
      assert.equal(g.code, (lang === 'vhdl' ? gen.generateVhdl : gen.generateVerilog)(m), `${lang} ${encoding}`);
      const lib = compile([{ path: g.filename, lang, text: g.code }]);
      assert.deepEqual(lib.errors, [], `${lang} ${encoding}: compile`);
      const design = elaborate(lib, 'ctl');
      assert.deepEqual(design.diags, [], `${lang} ${encoding}: elaborate`);
      assert.equal(design.top.name, 'ctl');
      const { model } = asmFromHdl(g.code, { path: g.filename });
      assert.ok(sameAsmStructure(model, m), `${lang} ${encoding}: recovered`);
      assert.equal(model.encoding, encoding);
    }
  }
});

test('#405 ASM generators: no every-cycle blocks in a plain chart; a decision outside them has no join point', () => {
  const m = asm.newModel('ctl', 'vhdl');
  assert.deepEqual(gen.extractAlwaysBlocks(m), []);
  const join = gen.asmJoinPoints(m);
  assert.equal(typeof join, 'function');
  assert.equal(join('d1') ?? null, null);
});
