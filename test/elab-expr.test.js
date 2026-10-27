// The elaboration of expressions (core/elab-expr.js, #405: out of elaborate.js), through the compiler, the elaborator
// and the simulator: Verilog and VHDL expressions over every value of their inputs, against the same expressions
// computed in JavaScript (an independent reference); names, slices, concatenation, conversions, a function with its
// overloads; the module loads first (it and elaborate.js import each other).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindExpr, pickOverload, BUILTIN_SUBPROGRAMS } from '../core/elab-expr.js';
import * as V from '../core/values.js';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';

// for each of `values` of `a`: the design's signals `names` after it settles, as bit strings
function run(path, lang, text, values, names) {
  const lib = compile([{ path, lang, text }]);
  assert.deepEqual(lib.errors, [], 'compile');
  const d = elaborate(lib, 'e');
  assert.deepEqual(d.diags, [], 'elaborate');
  const sig = (n) => d.signals.find((s) => s.path === `e.${n}`);
  return values.map((v) => {
    const a = sig('a');
    a.init = V.fromInt(v, a.t.w, false);
    const sim = new Simulator(d);
    sim.start(); sim.run(10);
    return Object.fromEntries(names.map((n) => [n, V.toBin(sim.valueAt(sig(n), sim.now))]));
  });
}
const bin = (v, w) => (BigInt.asUintN(w, BigInt(v))).toString(2).padStart(w, '0');

test('#405 elaboration of expressions: the module\'s functions, loaded first', () => {
  assert.equal(typeof bindExpr, 'function');
  assert.equal(typeof pickOverload, 'function');
  assert.ok(BUILTIN_SUBPROGRAMS.has('to_unsigned') && BUILTIN_SUBPROGRAMS.has('rising_edge'));
});

test('#405 elaboration of expressions: Verilog operators, slices, concatenation, reduction, against JavaScript', () => {
  const SRC = `module e;
  reg [7:0] a = 0;
  wire [8:0] sum = a + 8'd100;
  wire [7:0] shr = a >> 3;
  wire [15:0] mul = a * 3;
  wire top = &a[7:6];
  wire [11:0] cat = {a[3:0], a};
  wire [7:0] inv = ~a ^ 8'h0F;
  wire lt = a < 8'd77;
  wire signed [8:0] neg = -$signed({1'b0, a});
endmodule`;
  const values = [0, 1, 77, 128, 200, 255];
  const names = ['sum', 'shr', 'mul', 'top', 'cat', 'inv', 'lt', 'neg'];
  const got = run('e.v', 'verilog', SRC, values, names);
  values.forEach((a, i) => {
    assert.deepEqual(got[i], {
      sum: bin(a + 100, 9), shr: bin(a >> 3, 8), mul: bin(a * 3, 16), top: (a >> 6) === 3 ? '1' : '0',
      cat: bin(((a & 15) << 8) | a, 12), inv: bin(~a ^ 0x0f, 8), lt: a < 77 ? '1' : '0', neg: bin(-a, 9),
    }, `a = ${a}`);
  });
});

test('#405 elaboration of expressions: VHDL conversions, numeric_std, a function and its overloads, against JavaScript', () => {
  const SRC = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity e is end;
architecture r of e is
  signal a : std_logic_vector(7 downto 0) := (others => '0');
  function f(x : integer) return integer is begin return x * 2 + 1; end;
  function f(x : std_logic_vector) return std_logic_vector is begin return x(3 downto 0) & x(7 downto 4); end;
  signal n : integer range 0 to 1023;
  signal swp, sl, rs : std_logic_vector(7 downto 0);
  signal wide : std_logic_vector(11 downto 0);
  signal eq : std_logic;
begin
  n <= f(to_integer(unsigned(a)));
  swp <= f(a);
  sl <= std_logic_vector(shift_left(unsigned(a), 2));
  rs <= std_logic_vector(resize(unsigned(a(7 downto 4)), 8));
  wide <= std_logic_vector(resize(signed(a), 12));
  eq <= '1' when a = x"4D" else '0';
end;`;
  const values = [0, 1, 0x4d, 0x80, 0xc8, 0xff];
  const got = run('e.vhd', 'vhdl', SRC, values, ['n', 'swp', 'sl', 'rs', 'wide', 'eq']);
  values.forEach((a, i) => {
    const sx = a >= 128 ? a - 256 : a;
    // (n, an integer: 32 bits)
    assert.deepEqual(got[i], {
      n: bin(a * 2 + 1, 32), swp: bin(((a & 15) << 4) | (a >> 4), 8), sl: bin(a << 2, 8), rs: bin(a >> 4, 8), wide: bin(sx, 12),
      eq: a === 0x4d ? '1' : '0',
    }, `a = ${a}`);
  });
});

// #1692: a constant slice against its signal's direction is an error, as XST makes it: VHDL `a(1 to 2)` of a
// (3 downto 0), `b(2 downto 1)` of b (0 to 3); Verilog `a[1:2]` of [3:0], `b[2:1]` of [0:3]. In the signal's
// direction, a bit, a VHDL null slice: none
test('#1692 a slice in the opposite direction of its vector: an error in VHDL and Verilog; in its direction, none', async () => {
  const { compile, elaborate } = await import('../core/compile.js');
  const msgs = (path, text, top) => { const lib = compile([{ path, text }]); const d = elaborate(lib, top); return [...lib.errors, ...d.diags].map((x) => `${x.severity}: ${x.line} ${x.message}`); };
  assert.deepEqual(msgs('e.vhd', `library ieee; use ieee.std_logic_1164.all;
entity e is port (a : in std_logic_vector(3 downto 0); b : in std_logic_vector(0 to 3); y, z, w, v : out std_logic_vector(1 downto 0); q : out std_logic); end e;
architecture rtl of e is begin
  y <= a(1 to 2); z <= a(2 downto 1); w <= b(1 to 2); v <= b(2 downto 1); q <= a(1);
end rtl;`, 'e'), ["error: 4 slice 1 to 2 of 'a' against its direction (3 downto 0)", "error: 4 slice 2 downto 1 of 'b' against its direction (0 to 3)"]);
  assert.deepEqual(msgs('n.vhd', `library ieee; use ieee.std_logic_1164.all;
entity n is port (a : in std_logic_vector(3 downto 0); y : out std_logic_vector(3 downto 0)); end n;
architecture rtl of n is begin y <= a(0 to -1) & a; end rtl;`, 'n'), [], 'a null slice');
  assert.deepEqual(msgs('m.v', 'module m(input [3:0] a, input [0:3] b, output [1:0] y, z, w, v, output q);\n  assign y = a[1:2]; assign z = a[2:1]; assign w = b[1:2]; assign v = b[2:1]; assign q = a[1];\nendmodule', 'm'),
    ["error: 2 part-select [1:2] of 'a' in the opposite order of its range [3:0]", "error: 2 part-select [2:1] of 'b' in the opposite order of its range [0:3]"]);
});
