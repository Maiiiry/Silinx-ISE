// The instances and statements of the elaboration (#405: core/elab-instance.js and core/elab-stmt.js out of
// core/elaborate.js): elaborate.js still exports what moved. A VHDL test bench and a Verilog one, each with a generate
// loop whose condition picks an instance or an assignment per bit, a loop with waits, a procedure call (VHDL), a case
// and a message: no diagnostic, the values and the message expected, simulated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as elaborate from '../core/elaborate.js';
import { bindBlock, cI } from '../core/elab-stmt.js';
import { newSignal, elabInstance } from '../core/elab-instance.js';
import { compile } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import * as V from '../core/values.js';

const VHDL = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity inv is port (a : in std_logic; y : out std_logic); end;
architecture r of inv is begin y <= not a; end;
entity tb is end;
architecture t of tb is
  signal d : std_logic_vector(3 downto 0) := "0101";
  signal q : std_logic_vector(3 downto 0);
  signal cnt : integer := 0;
  signal sel : std_logic_vector(1 downto 0) := "10";
  signal m : std_logic;
  procedure bump(signal c : inout integer) is begin c <= c + 1; end;
begin
  g : for i in 0 to 3 generate
    even : if i mod 2 = 0 generate u : entity work.inv port map (a => d(i), y => q(i)); end generate;
    odd : if i mod 2 = 1 generate q(i) <= d(i); end generate;
  end generate;
  process begin
    for k in 1 to 3 loop bump(cnt); wait for 1 ns; end loop;
    case sel is when "10" => m <= '1'; when others => m <= '0'; end case;
    report "cnt=" & integer'image(cnt);
    wait;
  end process;
end;`;
const VERILOG = `module inv(input a, output y); assign y = ~a; endmodule
module tb;
  reg [3:0] d = 4'b0011; wire [3:0] q;
  genvar i;
  generate for (i = 0; i < 4; i = i + 1) begin : g
    if (i < 2) begin : lo inv u (.a(d[i]), .y(q[i])); end
    else begin : hi assign q[i] = d[i]; end
  end endgenerate
  integer k, n = 0;
  initial begin
    for (k = 0; k < 5; k = k + 1) begin #1 n = n + k; end
    case (n) 10: $display("n=%0d q=%b", n, q); default: $display("other"); endcase
  end
endmodule`;

const run = (lang, text, path, until) => {
  const d = elaborate.elaborate(compile([{ path, lang, text }]), 'tb');
  assert.deepEqual(d.diags, [], lang);
  const sim = new Simulator(d);
  sim.start();
  sim.run(until);
  const val = n => V.toBin(d.signals.find(s => s.path?.endsWith(`/${n}`) || s.name === n).val);
  return { sim, val };
};

test('#405 elaboration parts: elaborate.js exports what moved', () => {
  assert.deepEqual([elaborate.bindBlock, elaborate.cI, elaborate.newSignal], [bindBlock, cI, newSignal]);
  assert.equal(typeof elabInstance, 'function');
});

test('#405 elaboration parts, VHDL: a generate of instances and assignments, a loop of procedure calls, a case', () => {
  const { sim, val } = run('vhdl', VHDL, 'tb.vhd', 10000);
  // d = 0101: the even bits through an inverter instance, the odd ones assigned
  assert.equal(val('q'), '0000');
  assert.equal(BigInt('0b' + val('cnt')), 3n);
  assert.equal(val('m'), '1');
  assert.deepEqual(sim.log.map(e => e.text), ['cnt=3']);
});

test('#405 elaboration parts, Verilog: a generate of instances and assignments, a loop with delays, a case', () => {
  const { sim } = run('verilog', VERILOG, 'tb.v', 10000);
  assert.deepEqual(sim.log.map(e => e.text), ['n=10 q=0000']);
});
