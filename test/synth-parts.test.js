// The parts of the Verilog translator (#405: out of toVerilog in core/synth-verilog.js): values (synth-values.js),
// operators (synth-operators.js), tables, ROMs and functions (synth-tables.js), statements (synth-stmts.js) and the
// module (synth-module.js), each exercised by one design: its generated Verilog shows each part's construct, and
// compiled and simulated by Silinx it gives the outputs of the original design at every clock cycle under random
// inputs (the reference: the simulator on the original).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import * as V from '../core/values.js';
import { toVerilog } from '../core/synth-verilog.js';
import { mountValues } from '../core/synth-values.js';
import { mountOperators } from '../core/synth-operators.js';
import { mountTables } from '../core/synth-tables.js';
import { mountStatements } from '../core/synth-stmts.js';
import { writeModule } from '../core/synth-module.js';

const SRC = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity parts is port (clk, rst : in std_logic; a : in std_logic_vector(2 downto 0); b : in std_logic_vector(7 downto 0);
  q : out std_logic_vector(7 downto 0); r : out std_logic_vector(7 downto 0); t : out std_logic_vector(7 downto 0);
  m : out std_logic_vector(7 downto 0); f : out std_logic);
end;
architecture rtl of parts is
  type rom_t is array (0 to 7) of std_logic_vector(7 downto 0);
  constant ROM : rom_t := (x"11", x"22", x"33", x"44", x"55", x"66", x"77", x"88");
  type mem_t is array (0 to 3) of std_logic_vector(7 downto 0);
  signal mem : mem_t;
  type rec_t is record lo : std_logic_vector(3 downto 0); hi : std_logic_vector(3 downto 0); end record;
  signal rec : rec_t;
  signal acc : unsigned(7 downto 0);
  function swap(x : std_logic_vector(7 downto 0)) return std_logic_vector is begin return x(3 downto 0) & x(7 downto 4); end;
  procedure firstOne(x : in std_logic_vector(7 downto 0); signal y : out std_logic) is
  begin
    y <= '0';
    for i in 0 to 7 loop
      if x(i) = '1' then y <= '1'; exit; end if;
    end loop;
  end;
begin
  process (clk, rst) begin
    if rst = '1' then acc <= (others => '0'); rec <= (lo => x"0", hi => x"0");
    elsif rising_edge(clk) then
      acc <= acc + shift_left(to_unsigned(1, 8), to_integer(unsigned(a))) - 1;
      mem(to_integer(unsigned(a(1 downto 0)))) <= b;
      rec.lo <= b(3 downto 0); rec.hi <= b(7 downto 4);
    end if;
  end process;
  firstOne(b, f);
  q <= std_logic_vector(acc);
  r <= ROM(to_integer(unsigned(a)));
  t <= swap(b);
  m <= mem(to_integer(unsigned(a(1 downto 0)))) xor (rec.hi & rec.lo);
end;`;

function rng(seed) { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
// the outputs at every cycle under random inputs, rst high the first 2 cycles; registers and memories start at 0
function run(design, cycles = 200) {
  for (const s of design.signals) {
    const zero = (v) => (v && !Array.isArray(v) && v.w > 0 ? V.fromInt(0, v.w, false) : v);
    s.val = Array.isArray(s.val) ? s.val.map(zero) : zero(s.val);
  }
  const sim = new Simulator(design, { maxWaveEvents: 0 });
  const port = (n) => design.top.ports.find((p) => p.name.toLowerCase() === n);
  sim.addClock(port('clk').sig, { period: 20000 });
  const r = rng(11), out = [];
  for (let k = 0; k < cycles; k++) {
    const T = 10000 + k * 20000;
    sim.run(T + 5000);
    sim.force(port('rst').sig, V.mk(1, k < 2 ? 1n : 0n));
    sim.force(port('a').sig, V.mk(3, BigInt(Math.floor(r() * 8))));
    sim.force(port('b').sig, V.mk(8, BigInt(Math.floor(r() * 256))));
    sim.run(T + 19000);
    out.push(['q', 'r', 't', 'm', 'f'].map((n) => V.toBin(port(n).sig.val)).join(' '));
  }
  return out;
}

test('#405 Verilog translator parts: the mounts are the modules\' own', () => {
  for (const f of [mountValues, mountOperators, mountTables, mountStatements, writeModule]) assert.equal(typeof f, 'function');
});

test('#405 Verilog translator parts: one design through every part, its constructs, the same outputs as the original', () => {
  const orig = elaborate(compile([{ path: 'parts.vhd', lang: 'vhdl', text: SRC }]), 'parts');
  assert.deepEqual([...orig.lib.errors, ...orig.diags].filter((x) => x.severity === 'error'), []);
  const { text, top, warnings } = toVerilog(orig, { tables: true });
  assert.equal(top, 'parts');
  assert.deepEqual(warnings, []);
  // module: one flat module, its ports; statements: an always block with the asynchronous reset; values and
  // operators: the shift as a table (a function of the 3 bits of a); tables: the ROM and the user function
  assert.match(text, /^module parts \(/m);
  assert.match(text, /always @\(posedge clk or posedge rst\)/);
  assert.match(text, /function automatic/);
  assert.match(text, /8'h88|8'b10001000/);
  assert.match(text, /endmodule\n$/);
  const gen = elaborate(compile([{ path: 'parts.v', lang: 'verilog', text }]), 'parts');
  assert.deepEqual([...gen.lib.errors, ...gen.diags].filter((x) => x.severity === 'error'), []);
  const a = run(elaborate(compile([{ path: 'parts.vhd', lang: 'vhdl', text: SRC }]), 'parts')), b = run(gen);
  assert.ok(new Set(a).size > 20, 'the outputs change');
  assert.deepEqual(b, a);
});
