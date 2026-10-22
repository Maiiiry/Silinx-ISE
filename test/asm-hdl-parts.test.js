// The parts of the HDL analysis of an ASM chart made from HDL (#405: out of analyzeModule in
// core/asm-hdl-analysis.js): the states (asm-hdl-states.js), the input synchronisers (asm-hdl-sync.js) and the logic
// bodies (asm-hdl-bodies.js). The new chart's VHDL and Verilog: its three states, the initial one, the state and
// next-state signals, no generic and no every-cycle block; a hand-written Verilog machine with a two-flip-flop
// synchroniser on an input: the synchroniser found, and the chart's input marked synchronised.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as asm from '../core/asm.js';
import { generate } from '../core/asm-gen.js';
import { analyzeModule } from '../core/asm-hdl-analysis.js';
import { mountStates } from '../core/asm-hdl-states.js';
import { mountSynchronisers } from '../core/asm-hdl-sync.js';
import { mountLogicBodies } from '../core/asm-hdl-bodies.js';
import { asmFromHdl } from '../core/asm-from-hdl.js';
import { parse as parseVhdl } from '../core/vhdl/parser.js';
import { parse as parseVerilog } from '../core/verilog/parser.js';

const moduleOf = (src, lang) => (lang === 'vhdl' ? parseVhdl : parseVerilog)(src).units.find(u => u.kind === 'module');

const SYNC = `module ctl(input clk, input rst, input go_in, output reg busy);
  localparam A = 2'd0, B = 2'd1;
  reg m, s;
  reg [1:0] st, nx;
  always @(posedge clk or posedge rst)
    if (rst) begin st <= A; m <= 1'b0; s <= 1'b0; end
    else begin st <= nx; m <= go_in; s <= m; end
  always @* begin
    nx = st; busy = 1'b0;
    case (st)
      A: if (s) nx = B;
      B: begin busy = 1'b1; nx = A; end
    endcase
  end
endmodule`;

test('#405 HDL analysis parts: the mounts are the modules\'', () => {
  for (const f of [mountStates, mountSynchronisers, mountLogicBodies]) assert.equal(typeof f, 'function');
});

test('#405 HDL analysis parts: the new chart\'s HDL, both languages: states, initial, signals, bodies', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const src = generate(asm.normalizeModel(asm.newModel('ctl', lang)), lang).code;
    const A = analyzeModule(moduleOf(src, lang), src, lang);
    assert.deepEqual(A.states.map(s => s.name), ['IDLE', 'RUN', 'FINISH'], lang);
    assert.deepEqual([A.initial.name, A.S, A.N, A.enumType, A.sWidth], ['IDLE', 'state_reg', 'state_next', false, 2], lang);
    assert.deepEqual([A.generics, A.alwaysGroups, [...A.syncOf.keys()]], [[], [], []], lang);
    assert.equal(A.bodies.length, 3, lang);
    assert.deepEqual(A.warnings, [], lang);
  }
});

test('#405 HDL analysis parts: a two-flip-flop synchroniser on an input, found and kept on the chart\'s input', () => {
  const A = analyzeModule(moduleOf(SYNC, 'verilog'), SYNC, 'verilog');
  assert.deepEqual(A.states.map(s => s.name), ['A', 'B']);
  assert.deepEqual([...A.syncOf], [['go_in', { meta: 'm', sync: 's' }]]);
  const r = asmFromHdl(SYNC, { path: 'ctl.v' });
  assert.deepEqual(r.model.inputs.map(i => [i.name, i.sync]), [['go_in', true]]);
  assert.deepEqual(r.warnings, ["the state codes of 'st' follow no standard encoding; the chart re-encodes the states in binary"]);
});
