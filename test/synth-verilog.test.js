// core/synth-verilog.js: the synthesis front end (elaborated design -> one flat SystemVerilog
// module for Yosys). Every design is checked the same way: the generated Verilog is compiled and
// simulated by Silinx against the original, with random stimulus, and the outputs must be equal
// at every clock cycle (registers start at 0, as on the FPGA).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import * as V from '../core/values.js';
import { toVerilog, synthWidth, lit, SynthError, yosysCell } from '../core/synth-verilog.js';
import { UNISIM_SOURCE, primitiveSources } from '../core/unisim.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const vhd = (text, p = 'd.vhd') => ({ path: p, lang: 'vhdl', text });
const vlog = (text, p = 'd.v') => ({ path: p, lang: 'verilog', text });

function build(sources, top) {
  const d = elaborate(compile(sources), top);
  const bad = [...d.lib.errors, ...d.diags].filter(x => x.severity !== 'warning');
  assert.deepEqual(bad.map(x => `${x.file}:${x.line} ${x.message}`), []);
  return d;
}
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function powerUp(d) {
  const allX = v => v && !Array.isArray(v) && v.w > 0 && v.x === (1n << BigInt(v.w)) - 1n;
  for (const s of d.signals) {
    if (Array.isArray(s.val)) s.val = s.val.map(e => (allX(e) ? V.withSign(V.fromInt(0, e.w, false), e.s) : e));
    else if (allX(s.val)) s.val = V.withSign(V.fromInt(0, s.val.w, false), s.val.s);
  }
}
/** Outputs of `d` every cycle under seeded random inputs (`clock` driven, the reset `rst` high the first 2 cycles). */
function runRandom(d, { clock = 'clk', cycles = 400, seed = 7, reset = 'rst', ints = new Set() } = {}) {
  const s = new Simulator(d, { maxWaveEvents: 0 });
  powerUp(d);
  const ports = new Map(d.top.ports.map(p => [p.name.toLowerCase(), p]));
  const P = 20000;
  if (ports.has(clock)) s.addClock(ports.get(clock).sig, { period: P });
  const ins = d.top.ports.filter(p => p.dir === 'in' && p.name.toLowerCase() !== clock);
  const outs = d.top.ports.filter(p => p.dir !== 'in').sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));
  const r = rng(seed);
  const res = [];
  for (let k = 0; k < cycles; k++) {
    const R = P / 2 + k * P;
    s.run(R + P / 4);
    for (const p of ins) {
      const w = p.sig.t.w;
      let v = 0n;
      for (let i = 0; i < w; i += 16) v |= BigInt(Math.floor(r() * 65536)) << BigInt(i);
      v &= (1n << BigInt(w)) - 1n;
      if (p.name.toLowerCase() === reset) v = k < 2 || r() < 0.02 ? 1n : 0n;
      s.force(p.sig, V.mk(w, v));
    }
    s.run(R + P - 1000);
    // integers as numbers (synthesis gives an integer port the width of its range)
    res.push(outs.map(p => `${p.name}=${ints.has(p.name.toLowerCase()) ? (p.sig.val.x ? 'X' : V.toDec(p.sig.val, !!p.sig.val.s)) : V.toBin(p.sig.val)}`).join(' '));
  }
  return res;
}
/** The generated Verilog behaves as the original: same outputs every cycle. Returns the Verilog. */
function equivalent(sources, top, opts = {}) {
  const d = build(sources, top);
  const { text, top: vtop, warnings, primitives } = toVerilog(d);
  const g = build([...(primitives.length ? [UNISIM_SOURCE] : []), vlog(text, 'gen.v')], vtop);
  // integer ports (32 bits in simulation, the width of their range after synthesis): compared as numbers
  const ints = new Set(d.top.ports.filter(p => p.sig.t.kind === 'int').map(p => p.name.toLowerCase()));
  const a = runRandom(build(sources, top), { ...opts, ints }), b = runRandom(g, { ...opts, ints });
  const k = a.findIndex((x, i) => x !== b[i]);
  assert.equal(k, -1, k < 0 ? '' : `cycle ${k}:\n  original  ${a[k]}\n  generated ${b[k]}\n${text}`);
  assert.ok(new Set(a).size > (opts.minStates ?? 3), `the outputs change during the test (${new Set(a).size} states)`);
  return { text, warnings, primitives };
}

const PRE = 'library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;\n';

test('widths: integer signals get the width of their range; literals keep x and z bits', () => {
  assert.equal(synthWidth({ kind: 'int', w: 32, rlo: 0, rhi: 9 }), 4);
  assert.equal(synthWidth({ kind: 'int', w: 32, rlo: 0, rhi: 0 }), 1);
  assert.equal(synthWidth({ kind: 'int', w: 32, rlo: -4, rhi: 3 }), 3);
  assert.equal(synthWidth({ kind: 'int', w: 32, rlo: -1, rhi: 255 }), 9);
  assert.equal(synthWidth({ kind: 'int', w: 32 }), 32);
  assert.equal(synthWidth({ kind: 'logic', w: 8 }), 8);
  assert.equal(lit(V.fromInt(5, 4, false)), "4'h5");
  assert.equal(lit(V.fromBits('1x0z')), "4'b1x0z");
});

test('registers: asynchronous reset, clock enable, synchronous reset, falling edge, edge-conditional assignments', () => {
  equivalent([vhd(`${PRE}entity r is port (clk, rst, en, d : in std_logic; q1, q2, q3, q4, q5 : out std_logic); end r;
architecture a of r is signal s1, s2, s3, s4, s5 : std_logic; begin
  process (clk, rst) begin if rst = '1' then s1 <= '0'; elsif rising_edge(clk) then if en = '1' then s1 <= d; end if; end if; end process;
  process (clk) begin if rising_edge(clk) then if rst = '1' then s2 <= '1'; else s2 <= d xor s2; end if; end if; end process;
  process (clk) begin if falling_edge(clk) then s3 <= d; end if; end process;
  s4 <= d when rising_edge(clk);
  s5 <= '0' when rst = '1' else not s5 when clk'event and clk = '1';
  q1 <= s1; q2 <= s2; q3 <= s3; q4 <= s4; q5 <= s5;
end a;`)], 'r');
});

test('integers with ranges, enumerated state machine with case, outputs decoded from the state', () => {
  const { text } = equivalent([vhd(`${PRE}entity f is port (clk, rst, go, stop : in std_logic; busy : out std_logic; n : out integer range 0 to 9; st : out std_logic_vector(1 downto 0)); end f;
architecture a of f is
  type state_t is (idle, run, hold, done);
  signal s : state_t; signal c : integer range 0 to 9;
begin
  process (clk, rst) begin
    if rst = '1' then s <= idle; c <= 0;
    elsif rising_edge(clk) then
      case s is
        when idle => if go = '1' then s <= run; c <= 0; end if;
        when run => if stop = '1' then s <= hold; elsif c = 9 then s <= done; else c <= c + 1; end if;
        when hold => if go = '1' then s <= run; end if;
        when done => s <= idle;
      end case;
    end if;
  end process;
  busy <= '1' when s = run or s = hold else '0';
  n <= c;
  st <= std_logic_vector(to_unsigned(state_t'pos(s), 2));
end a;`)], 'f');
  assert.match(text, /logic \[3:0\] c = 4'h0;/, 'integer range 0 to 9 -> 4 bits, starting at its T\'left (#60)');
});

test('arithmetic: unsigned / signed numeric_std, resize, comparisons, shifts, rotations, multiplication', () => {
  equivalent([vhd(`${PRE}entity m is port (a, b : in std_logic_vector(7 downto 0); s : in std_logic_vector(2 downto 0);
  sum : out std_logic_vector(8 downto 0); dif : out signed(8 downto 0); prod : out unsigned(15 downto 0); lt, slt : out std_logic;
  sh_l, sh_r, rot : out std_logic_vector(7 downto 0); neg : out signed(7 downto 0)); end m;
architecture x of m is begin
  sum <= std_logic_vector(resize(unsigned(a), 9) + unsigned(b));
  dif <= resize(signed(a), 9) - resize(signed(b), 9);
  prod <= unsigned(a) * unsigned(b);
  lt <= '1' when unsigned(a) < unsigned(b) else '0';
  slt <= '1' when signed(a) < signed(b) else '0';
  sh_l <= std_logic_vector(shift_left(unsigned(a), to_integer(unsigned(s))));
  sh_r <= std_logic_vector(shift_right(signed(a), to_integer(unsigned(s))));
  rot <= std_logic_vector(rotate_left(unsigned(a), 3));
  neg <= -signed(a);
end x;`)], 'm', { clock: 'none' });
});

test('expressions of few input bits become tables of their values; wider ones stay operators', () => {
  const { text } = equivalent([vhd(`${PRE}entity t is port (clk : in std_logic; lvl : in std_logic_vector(2 downto 0); cnt, a, b : in unsigned(7 downto 0);
  kin : in unsigned(3 downto 0); sin : in signed(2 downto 0); ge, odd : out std_logic; m, s : out unsigned(7 downto 0);
  n, kk : out integer range 0 to 31; sq : out integer range -16 to 16; q : out unsigned(7 downto 0)); end t;
architecture x of t is
  signal r : unsigned(7 downto 0) := (others => '0');
  signal k : integer range 0 to 15; signal si : integer range -4 to 3;   -- integer ports would get other random values
begin
  k <= to_integer(kin); si <= to_integer(sin);
  -- (1 << lvl) - 1 at 32 bits, then compared with 8 bits: the table of lvl, then the comparator
  ge <= '1' when cnt >= shift_left(to_unsigned(1, 32), to_integer(unsigned(lvl))) - 1 else '0';
  m <= resize(shift_left(to_unsigned(1, 8), to_integer(unsigned(lvl))) - 1, 8);
  n <= k + 3;                                  -- an integer of 4 bits: 32-bit addition
  sq <= si * si - 1;                           -- signed
  odd <= '1' when (k mod 2) = 1 else '0';
  s <= a + b;                                  -- 16 input bits: an adder
  process (lvl) variable v : integer range 0 to 7; begin
    v := to_integer(unsigned(lvl));
    kk <= v * 3 + 1;                           -- a process variable
  end process;
  process (clk) begin if rising_edge(clk) then r <= r + unsigned(lvl); end if; end process;
  q <= r;
end x;`)], 't');
  const tabs = text.match(/function automatic \[\d+:0\] tab\d+\(input \[\d:0\] i\)/g) || [];
  assert.ok(tabs.length >= 5, text);
  assert.match(text, /tab\d+\(lvl\)/);
  assert.match(text, /tab\d+\(si\)/);
  assert.match(text, /8'\(a \+ b\)/);           // the adder of 16 input bits stays
  assert.match(text, /8'\(r \+ /);              // so does r + lvl (11 bits)
});

test('functions, procedures with signal outputs, loops with exit, case with ranges, process variables', () => {
  equivalent([vhd(`${PRE}entity p is port (clk : in std_logic; x : in std_logic_vector(7 downto 0); ones, lead : out integer range 0 to 8;
  par, big : out std_logic; seg : out std_logic_vector(6 downto 0); acc : out unsigned(7 downto 0)); end p;
architecture a of p is
  function count_ones(v : std_logic_vector) return integer is variable n : integer := 0;
  begin for i in v'range loop if v(i) = '1' then n := n + 1; end if; end loop; return n; end function;
  procedure seg7(d : in std_logic_vector(3 downto 0); signal o : out std_logic_vector(6 downto 0)) is begin
    case d is when x"0" => o <= "1000000"; when x"1" => o <= "1111001"; when x"2" => o <= "0100100"; when others => o <= "0111111"; end case;
  end procedure;
  signal r : unsigned(7 downto 0) := (others => '0');
begin
  ones <= count_ones(x);
  process (x) variable k : integer range 0 to 8; begin
    k := 8;
    for i in 7 downto 0 loop if x(i) = '1' then k := 7 - i; exit; end if; end loop;
    lead <= k;
  end process;
  par <= x(0) xor x(1) xor x(2) xor x(3) xor x(4) xor x(5) xor x(6) xor x(7);
  process (x) begin
    case to_integer(unsigned(x)) is when 0 to 99 => big <= '0'; when 100 to 255 => big <= '1'; when others => big <= '0'; end case;
  end process;
  seg7(x(3 downto 0), seg);
  process (clk) variable t : unsigned(7 downto 0); begin
    if rising_edge(clk) then t := r + unsigned(x); r <= t xor (t srl 1); end if;
  end process;
  acc <= r;
end a;`)], 'p');
});

test('memories: a constant ROM and a RAM written on the clock', () => {
  equivalent([vhd(`${PRE}entity mem is port (clk, we : in std_logic; addr : in std_logic_vector(3 downto 0); din : in std_logic_vector(7 downto 0);
  rom_q, ram_q : out std_logic_vector(7 downto 0)); end mem;
architecture a of mem is
  type rom_t is array (0 to 15) of std_logic_vector(7 downto 0);
  constant ROM : rom_t := (x"00", x"11", x"22", x"33", x"44", x"55", x"66", x"77", x"88", x"99", x"AA", x"BB", x"CC", x"DD", x"EE", x"FF");
  type ram_t is array (0 to 15) of std_logic_vector(7 downto 0);
  signal ram : ram_t := (others => (others => '0'));
begin
  rom_q <= ROM(to_integer(unsigned(addr)));
  process (clk) begin if rising_edge(clk) then
    if we = '1' then ram(to_integer(unsigned(addr))) <= din; end if;
    ram_q <= ram(to_integer(unsigned(addr)));
  end if; end process;
end a;`)], 'mem');
});

test('Verilog: always @(posedge clk or negedge rstn), case, ternary, concatenation, a function', () => {
  equivalent([vlog(`module v(input clk, input rstn, input [3:0] a, input [1:0] op, output reg [7:0] q, output [4:0] s);
  function [4:0] add5(input [3:0] x, input [3:0] y); add5 = x + y; endfunction
  assign s = op[0] ? add5(a, q[3:0]) : {1'b0, a};
  always @(posedge clk or negedge rstn)
    if (!rstn) q <= 8'h01;
    else case (op)
      2'd0: q <= {q[6:0], q[7]};
      2'd1: q <= q + a;
      2'd2: q <= q ^ {a, a};
      default: q <= ~q;
    endcase
endmodule`)], 'v', { reset: 'none' });
});

// Regressions found by differential testing against Yosys (test/corpus: the hana test f22_test of
// Yosys's tests, VlogHammer-style modules): >>> of an unsigned value was written as an arithmetic
// shift; signed operands of unsigned expressions were sign-extended; a case item wider than the
// case expression was truncated into a label that matched; a select of a signed vector (unsigned)
// was sign-extended; {s} of a signed s is unsigned.
test('Verilog: signedness rules: >>> of unsigned, mixed-sign comparisons, ?: and nested operators, case item widths and signs', () => {
  const { text } = equivalent([vlog(`module sg(input [3:0] u, input signed [3:0] s, input signed [4:0] t, input [1:0] n, input c,
    output [3:0] y1, output [3:0] y2, output y3, output [7:0] y4, output [4:0] y5, output reg [1:0] y6, output reg [1:0] y7,
    output [7:0] y8, output [7:0] y9, output [7:0] y10, output [7:0] y11);
  assign y1 = u >>> 2;
  assign y2 = s >>> 1;
  assign y3 = u <= (c ? t : s);
  assign y4 = u + (s + t);
  assign y5 = c ? $signed(1'b1) : 1'b0;
  always @* case (n) 3'b100: y6 = 2'd1; 3'b001: y6 = 2'd2; default: y6 = 2'd3; endcase
  always @* case (s) 6'd15: y7 = 2'd1; -6'sd2: y7 = 2'd2; default: y7 = 2'd0; endcase
  assign y8 = s[3 +: 1];
  assign y9 = t[n +: 2];
  assign y10 = s[2:1];
  assign y11 = {s + t};
endmodule`)], 'sg', { clock: 'none' });
  assert.match(text, /y1 = 4'\(u >> /, 'a logical shift');
});

test('the blinky example (mixed VHDL and Verilog) behaves the same after translation', () => {
  const dir = path.join(ROOT, 'examples', 'blinky');
  const pj = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'));
  const srcs = pj.files.filter(f => f.role !== 'sim').map(f => ({ path: f.path, lang: /\.vhdl?$/i.test(f.path) ? 'vhdl' : 'verilog', text: fs.readFileSync(path.join(dir, f.path), 'utf8') }));
  equivalent(srcs, pj.top, { cycles: 600, minStates: 1 });
});

test('what cannot be synthesized is reported with its line, not guessed', () => {
  const err = (src, top) => { try { toVerilog(build([vhd(src)], top)); return null; } catch (e) { assert.ok(e instanceof SynthError, e.stack); return e.message; } };
  assert.match(err(`${PRE}entity w is port (o : out std_logic); end w; architecture a of w is begin
  process begin o <= '0'; wait for 10 ns; o <= '1'; wait for 10 ns; end process; end a;`, 'w'), /waits cannot be synthesized|cannot be synthesized here/);
  assert.match(err(`${PRE}entity w is port (clk, d : in std_logic; o : out std_logic); end w; architecture a of w is begin
  process (clk) begin if rising_edge(clk) then o <= d; else o <= not d; end if; end process; end a;`, 'w'), /after the clock edge/);
  // array slices of non-constant bounds (#11): simulated only
  assert.match(err(`${PRE}entity w is port (clk : in std_logic; n : in integer range 0 to 3; o : out std_logic_vector(1 downto 0)); end w; architecture a of w is
  type m_t is array (0 to 3) of std_logic_vector(1 downto 0); signal h : m_t := (others => "00"); begin
  process (clk) begin if rising_edge(clk) then h(n to 3) <= (others => "11"); end if; end process; o <= h(0); end a;`, 'w'), /^assignment to an array slice of non-constant bounds is not supported by the open synthesis \(line 4\)$/);
});

test('Verilog front end: SystemVerilog size casts W\'(expr) truncate, extend by the sign and keep the signedness', () => {
  const d = build([vlog(`module c; wire [7:0] a = 8'hF5; wire signed [3:0] b = 4'sb1010; wire [3:0] x = 4'(a >> 4); wire [7:0] y = 8'(b);
  wire [7:0] z = 8'(4'(a)); endmodule`)], 'c');
  new Simulator(d).run(10);
  const val = n => V.toBin(d.top.signals.find(s => s.name === n).val);
  assert.equal(val('x'), '1111');
  assert.equal(val('y'), '11111010', 'sign extension of a signed value');
  assert.equal(val('z'), '00000101');
});

test('initial blocks: memory contents from a loop, registers, messages ignored; the values become initial values', () => {
  const { text } = equivalent([vlog(`module ib(input clk, input we, input [3:0] a, input [7:0] d, output reg [7:0] q, output reg [7:0] cnt);
  reg [7:0] mem [0:15];
  integer i;
  initial begin
    for (i = 0; i < 16; i = i + 1) mem[i] = i * 7 + 1;
    q = 8'h00;
    cnt = 8'h5a;
    $display("start");
  end
  always @(posedge clk) begin
    if (we) mem[a] <= d;
    q <= mem[a];
    cnt <= cnt + 1;
  end
endmodule`)], 'ib', { reset: 'none' });
  assert.match(text, /mem\[3\] = 8'h16;/, 'the contents computed by the loop');
  assert.match(text, /output logic \[7:0\] cnt = 8'h5a/, 'an output register with its initial value');
  assert.doesNotMatch(text, /\$display|always @\*\s*begin\s*end/);
});

test('initial values: a VHDL process that ends in a bare wait fills a memory', () => {
  equivalent([vhd(`${PRE}entity iv is port (clk : in std_logic; q : out std_logic_vector(7 downto 0)); end iv;
architecture a of iv is
  type ram_t is array (0 to 7) of unsigned(7 downto 0);
  signal ram : ram_t;
  signal k : unsigned(2 downto 0) := "000";
  signal r : unsigned(7 downto 0) := x"11";
begin
  process begin
    for i in 0 to 7 loop ram(i) <= to_unsigned(i * i + 3, 8); end loop;
    wait;
  end process;
  process (clk) begin if rising_edge(clk) then k <= k + 1; r <= r + ram(to_integer(k)); end if; end process;
  q <= std_logic_vector(r);
end a;`)], 'iv', { reset: 'none' });
});

test('initial blocks that cannot be synthesized are reported: delays, reading a driven signal, $readmemh', () => {
  const err = (src, top) => { try { toVerilog(build([vlog(src)], top)); return null; } catch (e) { assert.ok(e instanceof SynthError, e.stack); return e.message; } };
  assert.match(err('module e1(input clk, output reg q); initial begin q = 0; #5 q = 1; end endmodule', 'e1'), /waits cannot be synthesized \(line 1\)/);
  assert.match(err('module e2(input clk, input d, output reg q, output reg r); always @(posedge clk) q <= d; initial r = q; endmodule', 'e2'), /reads q, which another process drives/);
  assert.match(err('module e3(input [1:0] a, output [7:0] q); reg [7:0] m [0:3]; initial $readmemh("m.hex", m); assign q = m[a]; endmodule', 'e3'), /\$readmemh/);
  // a variable of another block's named block, read by its hierarchical name (#12): simulated only
  assert.match(err('module e4(input clk, input [3:0] d, output [3:0] q);\nalways @(posedge clk) begin : b reg [3:0] v; v = d; end\nassign q = b.v; endmodule', 'e4'), /^'b\.v': a hierarchical reference to a variable of another block cannot be synthesized \(line 3\)$/);
});

test('process variables and loop flags are named without dots (Yosys takes a dotted name for a hierarchical one)', () => {
  const { text } = equivalent([vhd(`${PRE}entity n is port (clk : in std_logic; x : in std_logic_vector(7 downto 0); q : out unsigned(3 downto 0)); end n;
architecture a of n is begin
  process (clk) variable k : unsigned(3 downto 0); begin
    if rising_edge(clk) then
      k := x"0" + 8;
      for i in 0 to 7 loop if x(i) = '1' then k := to_unsigned(i, 4); exit; end if; end loop;
      q <= k;
    end if;
  end process;
end a;`)], 'n', { reset: 'none' });
  assert.match(text, /p\d+_v\d+/);
  assert.doesNotMatch(text, /\\p\d+\./);
});

// Regression (#61): a process that only assigns vectors of no bit has no always block (not an
// empty one); a non-constant slice against its direction is null: nothing assigned
test('VHDL null ranges: processes left with no statement are left out; non-constant null slices assign nothing (#61)', () => {
  const sources = [vhd(`${PRE}entity nz is
  generic (N : natural := 0);
  port (clk, rst : in std_logic; a : in std_logic_vector(7 downto 0); y : out std_logic_vector(7 downto 0); q : out std_logic_vector(7 downto 0));
end;
architecture rtl of nz is
  signal e, f, g : std_logic_vector(N - 1 downto 0);
  signal r : std_logic_vector(7 downto 0) := (others => '0');
begin
  process (clk) begin if rising_edge(clk) then e <= (others => '0'); end if; end process;
  process (clk, rst) begin if rst = '1' then f <= (others => '0'); elsif rising_edge(clk) then f <= a(N - 1 downto 0); end if; end process;
  process (a) begin g <= a(N - 1 downto 0); end process;
  process (a)
    variable v : std_logic_vector(7 downto 0);
  begin
    v := a;
    for i in 0 to 3 loop v(i + N - 1 downto i) := not a(2 * i + N - 1 downto 2 * i); end loop;
    y <= v;
  end process;
  process (clk) begin if rising_edge(clk) then r <= a xor r; end if; end process;
  q <= r;
end;`)];
  const r = toVerilog(build(sources, 'nz'));
  assert.deepEqual(r.warnings, []);
  assert.equal((r.text.match(/\balways\b/g) || []).length, 3, `the loop process, the register and q:\n${r.text}`);
  assert.doesNotMatch(r.text, /begin\n\s*end\n\s*(\/\/|endmodule)|if \(rst\)/, 'no empty block, no empty reset branch');
  assert.doesNotMatch(r.text, /\+: 2\]/, 'no two-bit slice from the null one');
  equivalent(sources, 'nz', { reset: 'rst', minStates: 3 });
});

// Regression (#69, #10): a record is one packed vector (it was written with every field at the first
// field's width: wider fields truncated); arrays of records are memories of those vectors; a record
// port connects to an element of an array of records (neorv32's trace_o => cpu_trace(i))
test('VHDL records: packed fields of every width, arrays of records, record ports on array elements, constants, functions (#69, #10)', () => {
  const sources = [vhd(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'vhdl-records.vhd'), 'utf8'), 'vhdl-records.vhd')];
  const { text, warnings } = equivalent(sources, 'rtop', { reset: 'none', minStates: 20, cycles: 300 });
  assert.deepEqual(warnings, []);
  // (st 2 + cnt 4 + dat 12 + nibs 12 + ok 1 = 31 bits a record; the arrays: memories of 31-bit words)
  assert.match(text, /\[30:0\] arr \[0:3\];/);
  assert.match(text, /\[30:0\] leafs \[0:3\];/);
});

// Regression (#13): a function that reads no signal, called with constant arguments (verilog-lfsr's
// lfsr_mask(n) in a generate loop), is evaluated by the translator: its value is a literal (Yosys
// took ~110 s on the calls, with ~160 warnings); a call whose evaluation fails ($finish on a bad
// argument) stays a function
test('constant calls of signal-free functions are folded to literals; a call that fails stays a call (#13)', () => {
  const src = vlog(`module cf(input clk, input [7:0] a, output reg [7:0] q, output [7:0] y);
  function [7:0] mask(input integer k);
    reg [7:0] t [0:3]; integer i;
    begin
      if (k > 5) begin $error("bad"); $finish; end
      for (i = 0; i < 4; i = i + 1) t[i] = 8'h11 << i;
      mask = t[k % 4] ^ k;
    end
  endfunction
  genvar n;
  wire [7:0] m [0:3];
  generate for (n = 0; n < 4; n = n + 1) begin : g
    assign m[n] = mask(n);
  end endgenerate
  always @(posedge clk) q <= a ^ m[a[1:0]];
  assign y = a + mask(2);
endmodule`, 'cf.v');
  const { text, warnings } = equivalent([src], 'cf', { reset: 'none' });
  assert.deepEqual(warnings, []);
  assert.doesNotMatch(text, /fn_mask/, 'every call of constant arguments is a literal: no function left');
  assert.match(text, /8'h46/, 'mask(2) = 8\'h44 ^ 2');
  // (mask(9) runs $finish: not evaluated here, it stays a call)
  const bad = toVerilog(build([vlog(src.text.replace('output [7:0] y);', 'output [7:0] y, output [7:0] z);').replace('assign y = a + mask(2);', 'assign y = a + mask(2);\n  assign z = a ^ mask(9);'), 'cf.v')], 'cf')).text;
  assert.match(bad, /fn_mask\(32'h9\)/);
  assert.doesNotMatch(bad, /fn_mask\(32'h2\)/);
});

// #6: a design that uses a SystemVerilog package (types, an enumeration, a function) synthesizes as
// its RTL; a function's output argument used in an expression is refused, at its line
test('SystemVerilog packages in the open synthesis; output arguments of a function in an expression refused (#6)', () => {
  const sources = [vlog(`package cfg_pkg;
  parameter int W = 6;
  typedef logic [W-1:0] word_t;
  typedef enum logic [1:0] { ADD, SUB, XOR_, PASS } op_t;
  function automatic word_t step(op_t op, word_t a, word_t b);
    case (op) ADD: return a + b; SUB: return a - b; XOR_: return a ^ b; default: return b; endcase
  endfunction
endpackage`, 'cfg_pkg.sv'), vlog(`module acc import cfg_pkg::*; (input clk, input rst, input op_t op, input word_t d, output word_t q);
  always_ff @(posedge clk) if (rst) q <= '0; else q <= step(op, q, d);
endmodule`, 'acc.sv')];
  const { text, warnings } = equivalent(sources, 'acc', { minStates: 10 });
  assert.deepEqual(warnings, []);
  assert.match(text, /input wire \[1:0\] op/);
  const err = (src) => { try { toVerilog(build([vlog(src, 'o.sv')], 'o')); return null; } catch (e) { assert.ok(e instanceof SynthError, e.stack); return e.message; } };
  assert.match(err(`module o(input [3:0] a, output [3:0] y, output [3:0] z);
  function automatic [3:0] f(input [3:0] k, output [3:0] h); h = ~k; f = k + 1; endfunction
  reg [3:0] t, u; always @* begin t = f(a, u); end assign y = t; assign z = u; endmodule`), /^function f: output arguments of a function called in an expression cannot be synthesized \(line 3\)$/);
});

// Regression (#83): names that differ only in case are names of their own (Verilog a / A, VHDL
// extended identifiers \\Mixed\\ / \\mixed\\): not renamed (they were a_1, \\mixed\\_1)
test('ports and signals that differ only in case keep their names (#83)', () => {
  const v = equivalent([vlog(`module c(input clk, input a, input A, output reg y, output reg Y); reg t, T;
  always @(posedge clk) begin t <= a ^ A; T <= a & A; y <= t; Y <= T | t; end endmodule`, 'c.v')], 'c', { reset: 'none', minStates: 1 });
  assert.match(v.text, /^ {2}input wire a,\n {2}input wire A,\n {2}output logic y,\n {2}output logic Y$/m);
  assert.match(v.text, /^ {2}logic \[0:0\] t;$/m);
  assert.match(v.text, /^ {2}logic \[0:0\] T;$/m);
  assert.doesNotMatch(v.text, /_1\b/);
  const h = equivalent([vhd(`${PRE}entity m is port (clk, \\Mixed\\, \\mixed\\, mixed : in std_logic; q : out std_logic_vector(2 downto 0)); end;
architecture a of m is begin process (clk) begin if rising_edge(clk) then q <= \\Mixed\\ & \\mixed\\ & mixed; end if; end process; end;`)], 'm', { reset: 'none', minStates: 1 });
  assert.match(h.text, /input wire \\\\Mixed\\ ,\n {2}input wire \\\\mixed\\ ,\n {2}input wire mixed,/);
});

// Regression (#98): a clock or asynchronous reset that is a bit of a vector (rising_edge(clks(k))
// in a for-generate, clk'event and clk = '1' forms, Verilog posedge clks[0]) is that bit, not the
// whole vector (Yosys: "posedge … not 1 bit wide")
test('clocks and asynchronous resets that are bits of a vector: VHDL for-generate, \'event form, Verilog (#98)', () => {
  const h = equivalent([vhd(`${PRE}entity h is port (clks, rs, d : in std_logic_vector(1 downto 0); q, q2 : out std_logic_vector(1 downto 0)); end;
architecture a of h is begin
  g : for k in 0 to 1 generate
    process (clks(k), rs(k)) begin if rs(k) = '1' then q(k) <= '0'; elsif rising_edge(clks(k)) then q(k) <= d(k); end if; end process;
    process (clks(k)) begin if clks(k)'event and clks(k) = '0' then q2(k) <= not d(k); end if; end process;
  end generate;
end;`)], 'h', { clock: 'none', reset: 'none', minStates: 4, cycles: 300 });
  assert.match(h.text, /always @\(posedge clks\[0\] or posedge rs\[0\]\) begin\n {4}if \(rs\[0\]\) begin/);
  assert.match(h.text, /always @\(posedge clks\[1\] or posedge rs\[1\]\)/);
  assert.match(h.text, /always @\(negedge clks\[1\]\)/);
  const v = equivalent([vlog(`module v(input [1:0] clks, input [1:0] rs, input [1:0] d, output reg [1:0] q);
  always @(posedge clks[0] or posedge rs[1]) if (rs[1]) q[0] <= 0; else q[0] <= d[0];
  always @(negedge clks[1]) q[1] <= d[1];
endmodule`, 'v.v')], 'v', { clock: 'none', reset: 'none', minStates: 2, cycles: 300 });
  assert.match(v.text, /always @\(posedge clks\[0\] or posedge rs\[1\]\) begin\n {4}if \(rs\[1\]\) begin/);
  assert.match(v.text, /always @\(negedge clks\[1\]\)/);
});

test('Xilinx primitives instantiated by name stay instances with their generics; their simulation models are left out', () => {
  const src = vhd(`library ieee; use ieee.std_logic_1164.all; library unisim; use unisim.vcomponents.all;
entity pr is port (clk, d, ce : in std_logic; a : in std_logic_vector(3 downto 0); q, q2 : out std_logic); end pr;
architecture a of pr is signal clkb, s : std_logic; begin
  ub : BUFG port map (I => clk, O => clkb);
  us : SRL16E generic map (INIT => X"A5C3") port map (CLK => clkb, CE => ce, D => d, A0 => a(0), A1 => a(1), A2 => a(2), A3 => a(3), Q => s);
  q <= s;
  process (clkb) begin if rising_edge(clkb) then q2 <= s xor d; end if; end process;
end a;`);
  const { text, primitives } = equivalent([...primitiveSources([src]), src], 'pr', { reset: 'none' });
  assert.deepEqual(primitives.sort(), ['BUFG', 'SRL16E']);
  assert.match(text, /SRL16E #\(\n {4}\.INIT\(16'ha5c3\)\n {2}\) us \(/);
  assert.match(text, /BUFG ub \(\n {4}\.I\(clk\),\n {4}\.O\(clkb\)\n {2}\);/);
  assert.doesNotMatch(text, /started|rising_edge|\bus\.r\b/i, 'nothing of the simulation model');
});

test('Xilinx primitives instantiated from Verilog (no library clause) stay instances with their parameters (#17)', () => {
  const src = vlog(`module pv (input clk, d, ce, input [3:0] a, output q, q2, q3);
  wire clkb, s;
  BUFG ub (.I(clk), .O(clkb));
  SRL16E #(.INIT(16'hA5C3)) us (.CLK(clkb), .CE(ce), .D(d), .A0(a[0]), .A1(a[1]), .A2(a[2]), .A3(a[3]), .Q(s));
  FDE #(.INIT(1'b1)) uf (.C(clkb), .CE(ce), .D(s), .Q(q3));
  assign q = s;
  reg r = 1'b0;
  always @(posedge clkb) r <= s ^ d;
  assign q2 = r;
endmodule`, 'pv.v');
  const prims = primitiveSources([src]);
  assert.deepEqual(prims.map(p => p.path), ['<silinx>/unisim.vhd']);
  const { text, primitives, warnings } = equivalent([...prims, src], 'pv', { reset: 'none' });
  assert.deepEqual(primitives.sort(), ['BUFG', 'FDRE', 'SRL16E']);   // (FDE: the FDRE Yosys knows, R tied low)
  assert.deepEqual(warnings, []);
  assert.match(text, /SRL16E #\(\n {4}\.INIT\(16'ha5c3\)\n {2}\) us \(/);
  assert.match(text, /BUFG ub \(\n {4}\.I\(clk\),\n {4}\.O\(clkb\)\n {2}\);/);
});

// ---------------------------------------------------------------- the fixture designs
// test/fixtures/designs/<design>: sources and design.json (top, files, the `sim` section with the
// stimulus, as test/netgen-fixtures.test.js uses it). Each design is translated; the translation is
// simulated against the original; then, if Yosys is installed (not in CI), Yosys's netlist of the
// translation (synth_xilinx for the Spartan-3E) is simulated with Silinx's UNISIM models against the
// original too.
//
// A design with a bidirectional bus runs inside its harness (design.json sim.harness), which drives
// the bus when the design does not: left floating, the bus is 'Z' and a register that captures it
// holds 'Z' in the simulation of the original, a value no flip-flop can hold (an input buffer turns
// it into 'X' in the netlist). That difference is an artifact of simulating an undriven pin, not of
// the translation.
const DESIGNS = path.join(ROOT, 'test', 'fixtures', 'designs');
const fixtures = fs.readdirSync(DESIGNS).filter(n => fs.existsSync(path.join(DESIGNS, n, 'design.json'))).sort();
const langOf = f => (/\.(vhd|vhdl)$/i.test(f) ? 'vhdl' : 'verilog');

// deterministic pseudo-random numbers (mulberry32), seeded by the design name
function rngOf(seedText) {
  let a = [...seedText].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0, 0x9e3779b9);
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Input values per cycle (the `sim` section of design.json, as in test/netgen-fixtures.test.js). */
function stimulus(name, sim, inputs, cycles) {
  const r = rngOf(name);
  const bits = w => { let v = 0n; for (let i = 0; i < w; i += 16) v |= BigInt(Math.floor(r() * 65536)) << BigInt(i); return v & ((1n << BigInt(w)) - 1n); };
  const out = [];
  let cur = {};
  for (let k = 0; k < cycles; k++) {
    if (k % (sim.hold || 1) === 0) {
      cur = {};
      for (const { name: p, w } of inputs) {
        if (sim.prob?.[p] !== undefined) cur[p] = r() < sim.prob[p] ? 1n : 0n;
        else if (sim.bitprob?.[p]) cur[p] = sim.bitprob[p].reduce((v, pr, i) => v | (r() < pr ? 1n << BigInt(i) : 0n), 0n);
        else if (sim.ranges?.[p]) { const [lo, hi] = sim.ranges[p]; cur[p] = BigInt(lo + Math.floor(r() * (hi - lo + 1))); }
        else cur[p] = bits(w);
      }
      for (const [a, b] of Object.entries(sim.equalBias || {})) if (r() < 0.2) cur[a] = cur[b];
      // ports of a dual-port memory that must not address the same word in the same cycle
      for (const d of sim.distinct || []) {
        const m = BigInt(d.mask), sa = BigInt(d.shiftA || 0), sb = BigInt(d.shiftB || 0);
        if (((cur[d.a] >> sa) & m) === ((cur[d.b] >> sb) & m)) cur[d.b] ^= 1n << sb;
      }
    }
    out.push(k < 3 && sim.start ? { ...cur, ...Object.fromEntries(Object.entries(sim.start).map(([p, v]) => [p, BigInt(v)])) } : cur);
  }
  return out;
}
/**
 * Outputs of `design` every cycle: the inputs of cycle k applied a quarter period after its rising
 * edge (the `late` ones three quarters), the outputs sampled 1 ns before the next one. `up`: the
 * registers without an initial value start at 0, as on the FPGA (not for a netlist: its flip-flops
 * have their INIT, and zeroing its combinational nets would make them disagree with their inputs
 * for a moment at time 0, long enough to open a latch).
 */
function runFixture(design, sim, stim, up = true) {
  const P = sim.period;
  const s = new Simulator(design, { maxWaveEvents: 0 });
  if (up) powerUp(design);
  const port = new Map(design.top.ports.map(p => [p.name.toLowerCase(), p]));
  s.addClock(port.get(sim.clock.toLowerCase()).sig, { period: P });
  for (const [c, o] of Object.entries(sim.clocks || {})) s.addClock(port.get(c.toLowerCase()).sig, { period: o.period, offset: o.offset || 0 });
  const late = new Set((sim.late || []).map(x => x.toLowerCase()));
  const outs = design.top.ports.filter(p => p.dir !== 'in').sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));
  const apply = (vals, which) => {
    for (const [p, v] of Object.entries(vals)) {
      if (which !== undefined && late.has(p.toLowerCase()) !== which) continue;
      const sig = port.get(p.toLowerCase()).sig;
      s.force(sig, V.mk(sig.t.w, v));
    }
  };
  apply(stim[0]);
  const res = [];
  for (let k = 0; k < stim.length; k++) {
    const R = P / 2 + k * P;
    s.run(R + P / 4); apply(stim[k], false);
    s.run(R + (3 * P) / 4); apply(stim[k], true);
    s.run(R + P - 1000);
    res.push(outs.map(p => `${p.name}=${V.toBin(p.sig.val)}`).join(' '));
  }
  return res;
}
/** A fixture: its sources, the original's outputs, and its translation (`over`: changes to its `sim`). */
const fixtureCache = new Map();
function fixture(name, over) {
  const key = `${name} ${JSON.stringify(over || {})}`;
  if (fixtureCache.has(key)) return fixtureCache.get(key);
  const dir = path.join(DESIGNS, name);
  const spec = JSON.parse(fs.readFileSync(path.join(dir, 'design.json'), 'utf8'));
  const sim = { ...spec.sim, ...over };
  const srcs = spec.files.map(f => ({ path: f, lang: langOf(f), text: fs.readFileSync(path.join(dir, f), 'utf8') }));
  const harness = sim.harness ? [{ path: sim.harness, lang: 'vhdl', text: fs.readFileSync(path.join(dir, sim.harness), 'utf8') }] : [];
  const simTop = sim.harness ? 'harness' : spec.top;
  const original = () => build([...primitiveSources(srcs), ...srcs, ...harness], simTop);
  const d0 = original();
  const inputs = d0.top.ports.filter(p => p.dir === 'in' && p.name.toLowerCase() !== sim.clock.toLowerCase() && !(p.name in (sim.clocks || {})))
    .map(p => ({ name: p.name, w: p.sig.t.w }));
  const stim = stimulus(name, sim, inputs, Math.min(sim.cycles, 3000));
  const ref = runFixture(d0, sim, stim);
  const gen = toVerilog(build([...primitiveSources(srcs), ...srcs], spec.top));
  const f = { spec, sim, harness, simTop, stim, ref, gen };
  fixtureCache.set(key, f);
  return f;
}
function compare(f, got, what) {
  const k = f.ref.findIndex((x, i) => i >= (f.sim.skip || 0) && x !== got[i]);
  assert.equal(k, -1, k < 0 ? '' : `${what}: first difference at cycle ${k}\n  original ${f.ref[k]}\n  ${what} ${got[k]}`);
}

for (const name of fixtures) {
  test(`fixture ${name}: the generated Verilog simulates as the original`, () => {
    const f = fixture(name);
    const g = build([...(f.gen.primitives.length ? [UNISIM_SOURCE] : []), vlog(f.gen.text, `${name}.v`), ...f.harness], f.simTop);
    compare(f, runFixture(g, f.sim, f.stim), 'generated');
    assert.ok(new Set(f.ref).size > 3, 'the outputs change during the test');
  });
}

// Yosys connects the pad pin of each IOBUF to one bit of the inout port; Silinx elaborates an inout
// formal associated with part of a signal as an output only, so (as test/netgen-fixtures.test.js
// does for netgen's netlists, core/netlist-hier.js splitInoutBuffers) each IOBUF is simulated as
// the equivalent OBUFT (driving the pad) and IBUF (reading the resolved pad).
function splitIobufs(text) {
  return text.replace(/\bIOBUF\s+(\S+)\s*\(([^;]*)\);/g, (all, inst, body) => {
    const pin = Object.fromEntries([...body.matchAll(/\.(\w+)\(([^()]*(?:\([^()]*\))?[^()]*)\)/g)].map(m => [m[1], m[2].trim()]));
    if (!pin.IO) return all;
    return `OBUFT ${inst}_t (.I(${pin.I || ''}), .T(${pin.T || ''}), .O(${pin.IO}));\n  IBUF ${inst}_i (.I(${pin.IO}), .O(${pin.O || ''}));`;
  });
}
// Yosys puts the gate enable of the latch fixture in the LUT that drives the gate (ISE uses the
// latch's GE pin): ge changing at the same instant as d (which goes straight to the latch) then
// races with it in a zero-delay simulation, as it would on the chip. ge changes with the gate here.
const YOSYS_SIM = { latch: { late: ['g', 'ge', 'g3'] } };
const hasYosys = (() => { try { execFileSync('yosys', ['-V'], { stdio: 'ignore' }); return true; } catch { return false; } })();
test('fixture designs through Yosys (synth_xilinx -family xc3se): the netlist simulates as the original', { skip: hasYosys ? false : 'yosys is not on PATH' }, async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-yosys-'));
  try {
    for (const name of fixtures) {
      await t.test(name, () => {
        const f = fixture(name, YOSYS_SIM[name]);
        fs.writeFileSync(path.join(tmp, `${name}.v`), f.gen.text);
        execFileSync('yosys', ['-q', '-p', `read_verilog -sv ${name}.v; synth_xilinx -family xc3se -ise -flatten -top ${f.gen.top}; delete t:$scopeinfo; write_verilog -noattr ${name}_net.v`],
          { cwd: tmp, stdio: ['ignore', 'ignore', 'pipe'] });
        const net = splitIobufs(fs.readFileSync(path.join(tmp, `${name}_net.v`), 'utf8'))
          // a flip-flop whose register had no initial value gets INIT x from Yosys: 0 in the bitstream
          .replace(/\.INIT\((\d+)'([bh])([0-9a-fx]+)\)/g, (_, w, b, d) => `.INIT(${w}'${b}${d.replace(/x/g, '0')})`);
        const d = build([UNISIM_SOURCE, vlog(net, `${name}_net.v`), ...f.harness], f.simTop);
        compare(f, runFixture(d, f.sim, f.stim, false), 'netlist');
      });
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('the simple UNISIM flip-flops and latches become the cells Yosys knows (unused pins tied inactive)', () => {
  const c = (n, p) => yosysCell(n, p.split(' '));
  assert.deepEqual(c('FD', 'C D Q'), { name: 'FDRE', tie: { CE: "1'b1", R: "1'b0" } });
  assert.deepEqual(c('FDE', 'C CE D Q'), { name: 'FDRE', tie: { R: "1'b0" } });
  assert.deepEqual(c('FDS', 'C S D Q'), { name: 'FDSE', tie: { CE: "1'b1" } });
  assert.deepEqual(c('FDC_1', 'C CLR D Q'), { name: 'FDCE_1', tie: { CE: "1'b1" } });
  assert.deepEqual(c('FDCP', 'C CLR PRE D Q'), { name: 'FDCPE', tie: { CE: "1'b1" } });
  assert.deepEqual(c('LD', 'G D Q'), { name: 'LDCE', tie: { CLR: "1'b0", GE: "1'b1" } });
  assert.deepEqual(c('LDE', 'G GE D Q'), { name: 'LDCE', tie: { CLR: "1'b0" } });
  assert.deepEqual(c('LDP', 'G PRE D Q'), { name: 'LDPE', tie: { GE: "1'b1" } });
  for (const n of ['FDRE', 'FDCPE_1', 'LDCE', 'BUFG', 'RAMB16_S9']) assert.deepEqual(c(n, 'X'), { name: n, tie: {} });
  assert.deepEqual(c('LD_1', 'G D Q'), { name: 'LD_1', tie: {} });   // none in Yosys's library: Yosys says so
  // in the text
  const text = `library ieee; use ieee.std_logic_1164.all; library unisim; use unisim.vcomponents.all;
entity t is port (clk, d, g : in std_logic; q, q2 : out std_logic); end t;
architecture rtl of t is begin
  u1: FD generic map (INIT => '1') port map (C => clk, D => d, Q => q);
  u2: LD port map (G => g, D => d, Q => q2);
end rtl;
`;
  const srcs = [{ path: 't.vhd', lang: 'vhdl', text }];
  const r = toVerilog(elaborate(compile([...primitiveSources(srcs), ...srcs]), 't'));
  assert.match(r.text, /FDRE #\(\n {4}\.INIT\(1'h1\)\n {2}\) u1 \(\n {4}\.CE\(1'b1\),\n {4}\.R\(1'b0\),\n {4}\.C\(clk\)/);
  assert.match(r.text, /LDCE u2 \(\n {4}\.CLR\(1'b0\),\n {4}\.GE\(1'b1\),\n {4}\.G\(g\)/);
  assert.deepEqual(r.primitives, ['FDRE', 'LDCE']);
});

test('variables keep their declared initial values: a process\'s as its register\'s, a procedure\'s on every call', () => {
  const text = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity t is port (clk : in std_logic; a : in unsigned(3 downto 0); q : out std_logic; s : out unsigned(3 downto 0)); end t;
architecture rtl of t is
  procedure addk(x : in unsigned(3 downto 0); signal y : out unsigned(3 downto 0)) is
    variable k : unsigned(3 downto 0) := "0011";
  begin k := k + x; y <= k; end procedure;
begin
  process (clk) variable v : std_logic := '1'; begin if rising_edge(clk) then v := not v; q <= v; end if; end process;
  process (clk) begin if rising_edge(clk) then addk(a, s); end if; end process;
end rtl;
`;
  const r = toVerilog(elaborate(compile([{ path: 't.vhd', lang: 'vhdl', text }]), 't'));
  assert.match(r.text, /reg \[0:0\] p0_v0 = 1'h1;/);
  assert.match(r.text, /p1_addk0_v0 = a;\n {4}p1_addk0_v1 = 4'h3;\n {4}p1_addk0_v1 = 4'\(p1_addk0_v1 \+ p1_addk0_v0\);/);
});

// Regression (#9): a VHDL enumeration signal without an initial value starts at its first literal
// (T'left): written as its initial value, so that Yosys's FSM re-encoding cannot start it elsewhere
test('VHDL enumeration and boolean signals start at their declared or default (first) value (#9)', () => {
  const text = `${PRE}entity t is port (clk, go : in std_logic; q, z : out std_logic); end t;
architecture rtl of t is
  type state_t is (idle, load, run, finish);
  signal s : state_t; signal s2 : state_t := run; signal b : boolean; signal l : std_logic; signal n : natural range 0 to 7;
begin
  process (clk) begin
    if rising_edge(clk) then
      if go = '1' then s <= state_t'succ(s); s2 <= s; b <= not b; l <= go; n <= n + 1; end if;
    end if;
  end process;
  q <= '1' when s = run or s2 = load or b else '0';
  z <= l when n = 3 else '0';
end rtl;
`;
  const r = toVerilog(build([vhd(text)], 't'));
  assert.deepEqual(r.warnings, []);
  assert.match(r.text, /^ {2}logic \[1:0\] s = 2'h0;$/m, 'the first literal');
  assert.match(r.text, /^ {2}logic \[1:0\] s2 = 2'h2;$/m, 'the declared value');
  assert.match(r.text, /^ {2}logic \[0:0\] b = 1'h0;$/m, 'false');
  assert.match(r.text, /^ {2}logic \[0:0\] l;$/m, "std_logic: 'U', no initial value");
  assert.match(r.text, /^ {2}logic \[2:0\] n = 3'h0;$/m, 'integers: their T\'left too (#60)');
});

// Regression (#15): a vector of a null range has no bit: not declared (Verilog has no zero-width
// vector: [-1:0] is two bits), left out of concatenations and assignments, not a port
test('VHDL null ranges: vectors of no bit are left out of the module, its ports and its concatenations (#15)', () => {
  const sources = [vhd(`${PRE}entity opt is
  generic (N : natural := 0);
  port (clk : in std_logic; a : in std_logic_vector(3 downto 0); x : in std_logic_vector(N - 1 downto 0);
        y : out std_logic_vector(N + 3 downto 0); n_out : out std_logic_vector(N - 1 downto 0); cnt : out unsigned(3 downto 0));
end;
architecture rtl of opt is
  signal r : std_logic_vector(N - 1 downto 0);
  signal c : unsigned(3 downto 0) := (others => '0');
begin
  y <= x & a;
  n_out <= r;
  process (clk) begin
    if rising_edge(clk) then
      r <= x;
      for i in 0 to N - 1 loop c <= c + 1; end loop;
      if N = 0 then c <= c + 3; end if;
    end if;
  end process;
  cnt <= c;
end;
${PRE}entity top is port (clk : in std_logic; a : in std_logic_vector(3 downto 0); y : out std_logic_vector(3 downto 0); cnt : out unsigned(3 downto 0)); end;
architecture rtl of top is
  signal none : std_logic_vector(-1 downto 0);
begin
  u : entity work.opt generic map (N => 0) port map (clk => clk, a => a, x => none, y => y, n_out => open, cnt => cnt);
end;`)];
  const r = toVerilog(build(sources, 'opt'));
  assert.deepEqual(r.warnings, []);
  assert.match(r.text, /^module opt \(\n {2}input wire clk,\n {2}input wire \[3:0\] a,\n {2}output logic \[3:0\] y,\n {2}output logic \[3:0\] cnt\n\);$/m);
  assert.doesNotMatch(r.text, /\[-1:0\]|\bx\b|n_out|\br\b/);
  assert.match(r.text, /^ {4}y <= a;$/m);
  const { text } = equivalent(sources, 'top', { minStates: 3 });
  assert.doesNotMatch(text, /\[-1:0\]|none/);
});
