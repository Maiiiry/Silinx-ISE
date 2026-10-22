// The calls of the elaboration (#405: core/elab-call.js out of core/elab-expr.js): elab-expr.js still exports what
// moved. A VHDL test bench: numeric_std's to_unsigned and resize, an overloaded function chosen by its argument
// (integer, unsigned), rising_edge, textio's write and writeline; a Verilog one: $clog2 (with XST's warning),
// $signed, a user function and $display: no error, the values and the messages expected, simulated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as elabExpr from '../core/elab-expr.js';
import * as elabCall from '../core/elab-call.js';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import * as V from '../core/values.js';

const VHDL = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all; use std.textio.all;
entity tb is end;
architecture t of tb is
  function dbl(x : integer) return integer is begin return 2 * x; end;
  function dbl(x : unsigned) return unsigned is begin return x(x'high - 1 downto 0) & '0'; end;
  signal a : unsigned(3 downto 0) := to_unsigned(5, 4);
  signal b : unsigned(7 downto 0);
  signal n : integer;
  signal clk : std_logic := '0';
  signal q : std_logic := '0';
begin
  b <= resize(dbl(a), 8);
  n <= dbl(21);
  clk <= not clk after 5 ns;
  process (clk) begin if rising_edge(clk) then q <= not q; end if; end process;
  process variable l : line; begin wait for 1 ns; write(l, n); writeline(output, l); wait; end process;
end;`;
const VERILOG = `module tb; function [7:0] inc(input [7:0] x); inc = x + 1; endfunction
  localparam W = $clog2(200); wire signed [7:0] s = $signed(8'hF0); wire [7:0] y = inc(8'd41);
  initial #1 $display("%0d %0d %0d", W, s, y); endmodule`;

const sigOf = (d, n) => d.signals.find(s => s.path?.endsWith(`/${n}`) || s.name === n);

test('#405 elaboration calls: elab-expr.js exports the module\'s names', () => {
  for (const k of ['BUILTIN_SUBPROGRAMS', 'TEXTIO_PROCS', 'bindTextio', 'boundFunction', 'pickOverload', 'positional']) assert.equal(elabExpr[k], elabCall[k], k);
});

test('#405 elaboration calls, VHDL: built-ins, an overload chosen by its argument, rising_edge, textio', () => {
  const d = elaborate(compile([{ path: 'tb.vhd', lang: 'vhdl', text: VHDL }]), 'tb');
  assert.deepEqual(d.diags, []);
  const sim = new Simulator(d);
  sim.start();
  sim.run(8000);
  assert.equal(V.toBin(sigOf(d, 'q').val), '1', 'one rising edge');
  sim.run(18000);
  assert.equal(V.toBin(sigOf(d, 'q').val), '0', 'two rising edges');
  assert.equal(V.toBin(sigOf(d, 'b').val), '00001010', 'resize(dbl(unsigned 5), 8)');
  assert.equal(V.toNum(sigOf(d, 'n').val), 42, 'dbl(integer 21)');
  assert.deepEqual(sim.log.map(e => e.text), ['42']);
});

test('#405 elaboration calls, Verilog: $clog2 with XST\'s warning, $signed, a user function, $display', () => {
  const d = elaborate(compile([{ path: 'tb.v', lang: 'verilog', text: VERILOG }]), 'tb');
  assert.deepEqual(d.diags.map(x => `${x.severity} ${x.line}: ${x.message}`), ['warning 2: $clog2 is not supported by XST (ISE 14.7); use a constant function instead']);
  const sim = new Simulator(d);
  sim.start();
  sim.run(10000);
  assert.deepEqual(sim.log.map(e => e.text), ['8 -16 42']);
});
