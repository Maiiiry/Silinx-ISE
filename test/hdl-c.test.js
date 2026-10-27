// HDL to C (#1530): core/hdl-c.js (with hdl-c-expr.js, hdl-c-stmt.js). Each design's C model, compiled with cc, and
// Silinx's simulator run on the same input vectors (random, a clock's rising edge a cycle): the same outputs, cycle by
// cycle. The examples' modules (a schematic's, a truth table's and a state diagram's generated HDL among them, VHDL and
// Verilog, combinational and clocked, functions with loops), and designs of the operators whose widths and signs are
// the hard part; what cannot be modelled, said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compile, elaborate } from '../core/compile.js';
import { hdlToCSafe } from '../core/hdl-c.js';
import { noCC, rng } from './c-helpers.js';
import { runModel, runSim } from './hdl-c-helpers.js';
import { ROOT } from './examples-lib.mjs';

/** The model and the simulator on n random cycles: the same outputs. pick(name, cycle, r) may give an input's value. */
function same(sources, top, { n = 60, seed = 5, pick = null } = {}) {
  const m = runModel(sources, top, [{}]).model;
  const r = rng(seed);
  const vecs = Array.from({ length: n }, (_, j) => Object.fromEntries(m.inputs.map((i) => [i.name, pick?.(i.name, j, r) ?? (BigInt(r()) | (BigInt(r()) << 32n))])));
  const c = runModel(sources, top, vecs).lines, s = runSim(sources, top, m, vecs);
  for (let k = 0; k < n; k++) assert.equal(c[k], s[k], `${top}, cycle ${k}: ${m.outputs.map((o) => o.name).join(' ')}`);
  return m;
}
const ex = (dir, file) => ({ path: file, text: fs.readFileSync(path.join(ROOT, 'examples', dir, file), 'utf8') });

test('#1530 the examples\' modules: their C models compute what the simulator does (a schematic\'s, a truth table\'s, a state diagram\'s HDL; VHDL and Verilog; clocked; functions)', { skip: noCC }, () => {
  const kinds = [];
  for (const [dir, file, top] of [['gates', 'src/gates.vhd', 'gates'], ['traffic', 'src/lamps.vhd', 'lamps'], ['traffic', 'src/sevenseg.v', 'sevenseg'],
    ['traffic', 'src/timer.vhd', 'timer'], ['traffic', 'src/traffic.vhd', 'traffic'], ['stopwatch', 'src/to_decimal.vhd', 'to_decimal'],
    ['stopwatch', 'src/sevenseg.vhd', 'sevenseg'], ['stopwatch', 'src/debounce.vhd', 'debounce']]) {
    const m = same([ex(dir, file)], top);
    kinds.push(`${top}:${m.clock ? `step(${m.clock})` : 'eval'}`);
  }
  assert.deepEqual(kinds, ['gates:eval', 'lamps:eval', 'sevenseg:step(clk)', 'timer:step(clk)', 'traffic:step(clk)', 'to_decimal:step(clk)', 'sevenseg:step(clk)', 'debounce:step(clk)']);
});

test('#1530 the operators\' widths and signs (Verilog\'s context widths, $signed, >>>, part-selects, case with a loop; VHDL\'s numeric_std, shifts, mod, a function with a loop, an enumerated state machine with a reset)', { skip: noCC }, () => {
  const V = `module ops(input [7:0] a, input signed [7:0] b, input [3:0] k, input signed [15:0] c, input [2:0] sel,
  output [15:0] y1, output signed [15:0] y2, output [7:0] y3, output y4, output [11:0] y5, output [7:0] y6, output [15:0] y7, output reg [7:0] y8);
  assign y1 = a * b + c;
  assign y2 = $signed(a) * b - (c >>> k);
  assign y3 = {a[3:0], b[7:4]} ^ ~a;
  assign y4 = (b < $signed({1'b0, a})) && |k || ^c;
  assign y5 = {3{k}} + (a << k) - (b >> 2);
  assign y6 = sel[1] ? a / (k | 4'd1) : b % (k + 4'd1);
  assign y7 = c[sel[1:0] * 3 +: 4] + {{8{b[7]}}, b} + (a > b);
  always @* begin
    y8 = 8'h00;
    case (sel)
      3'd0: y8 = a & b;
      3'd1, 3'd2: y8 = a - b;
      3'd3: begin y8 = a; y8[k[2:0]] = 1'b1; end
      default: for (integer i = 0; i < 8; i = i + 1) y8[i] = a[7 - i];
    endcase
  end
endmodule
`;
  same([{ path: 'ops.v', text: V }], 'ops', { n: 200, seed: 9 });
  const VH = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity vops is port (a: in unsigned(7 downto 0); b: in signed(7 downto 0); k: in unsigned(2 downto 0); clk, rst, en: in std_logic;
  y1: out signed(15 downto 0); y2: out unsigned(7 downto 0); y3: out std_logic_vector(7 downto 0); cnt: out unsigned(5 downto 0); y4: out integer range 0 to 255); end;
architecture rtl of vops is
  signal c: unsigned(5 downto 0) := (others => '0');
  type st_t is (IDLE, RUN, STOP); signal st: st_t := IDLE;
  function rev(x: std_logic_vector) return std_logic_vector is variable r: std_logic_vector(x'range); begin for i in x'range loop r(i) := x(x'left - i + x'right); end loop; return r; end;
begin
  y1 <= signed(resize(a, 16)) - resize(b, 16) * to_signed(3, 16)(7 downto 0);
  y2 <= shift_left(a, to_integer(k)) + unsigned(std_logic_vector(b)) when b(7) = '0' else a sll 1;
  y3 <= rev(std_logic_vector(a)) xor std_logic_vector(b);
  y4 <= to_integer(a) mod 7 + to_integer(k);
  process (clk) begin
    if rising_edge(clk) then
      if rst = '1' then c <= (others => '0'); st <= IDLE;
      else
        case st is
          when IDLE => if en = '1' then st <= RUN; end if;
          when RUN => c <= c + 1; if c = 40 then st <= STOP; end if;
          when STOP => if en = '0' then st <= IDLE; c <= c - 3; end if;
        end case;
      end if;
    end if;
  end process;
  cnt <= c;
end;
`;
  const m = same([{ path: 'vops.vhd', text: VH }], 'vops', { n: 200, seed: 9, pick: (nm, j, r) => (nm === 'rst' ? BigInt(j < 2 || r() % 50 === 0 ? 1 : 0) : nm === 'en' ? BigInt(r() % 4 !== 0 ? 1 : 0) : null) });
  assert.equal(m.clock, 'clk');
  assert.match(m.text, /^void vops_step\(vops_t \*s\) \{$/m);
  assert.match(m.text, /^static uint64_t ap_f0_rev\(vops_t \*s, uint64_t a0\) \{$/m);
});

test('#1530 what a C model cannot be: said, with its line', () => {
  const err = (text, top, file = 'd.v') => hdlToCSafe(elaborate(compile([{ path: file, text }]), top)).errors;
  assert.deepEqual(err('module f(input clk, input d, output reg q);\n  always @(negedge clk) q <= d;\nendmodule\n', 'f'), ["a falling edge of 'clk': only rising edges are modelled (line 2, d.v)"]);
  assert.deepEqual(err('module f(input c1, c2, input d, output reg q, r);\n  always @(posedge c1) q <= d;\n  always @(posedge c2) r <= d;\nendmodule\n', 'f'), ["two clocks, 'c1' and 'c2': a C model of one clock only (line 3, d.v)"]);
  assert.deepEqual(err('module f(input [99:0] a, output [99:0] y);\n  assign y = ~a;\nendmodule\n', 'f'), ["'a' has 100 bits: a C model's values have at most 64"]);
  assert.deepEqual(err('module f(input a, output reg y);\n  always begin #5 y = a; end\nendmodule\n', 'f'), ["a wait (a test bench's): it cannot be modelled (line 2)"]);
});
