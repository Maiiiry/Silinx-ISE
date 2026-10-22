// The parts of the interpreter (#405: out of core/interp.js): the strings and formatting (interp-format.js) and
// std.textio with math_real (interp-textio.js); interp.js still exports what moved. Through the simulator: a VHDL
// test bench's lines written with textio, a real from math_real, the images of report; a Verilog one's $display
// formats (%d %h %b %t %f %s) and its real math: the text expected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as interp from '../core/interp.js';
import { toStr, imageOf, formatTime, formatDisplay, strToVal } from '../core/interp-format.js';
import { mathReal } from '../core/interp-textio.js';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';

const VHDL = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all; use ieee.math_real.all; use std.textio.all;
entity tb is end;
architecture t of tb is begin
  process
    variable l : line; variable v : std_logic_vector(7 downto 0) := x"a5"; variable r : real;
  begin
    write(l, string'("n=")); write(l, 42); write(l, string'(" v=")); write(l, v); writeline(output, l);
    r := sqrt(2.0); write(l, r, right, 0, 3); writeline(output, l);
    report "time " & time'image(now);
    wait for 10 ns;
    report integer'image(to_integer(unsigned(v)));
    wait;
  end process;
end;`;
const VERILOG = `module tb; reg [7:0] a = 8'hc3; real x = 2.5;
  initial begin $display("a=%d h=%h b=%b", a, a, a); #5 $display("t=%0t x=%f s=%s", $time, $sqrt(x * x), "ok"); end
endmodule`;

function messages(lang, text, path) {
  const d = elaborate(compile([{ path, lang, text }]), 'tb');
  assert.deepEqual(d.diags, [], lang);
  const sim = new Simulator(d);
  sim.start();
  sim.run(100000);
  return sim.log.map(e => e.text);
}

test('#405 interpreter parts: interp.js exports what moved', () => {
  assert.deepEqual([interp.toStr, interp.imageOf, interp.formatTime, interp.formatDisplay, interp.strToVal, interp.mathReal], [toStr, imageOf, formatTime, formatDisplay, strToVal, mathReal]);
  assert.equal(mathReal('$sqrt', 9), 3);
  assert.equal(mathReal('$pow', 2, 10), 1024);
});

test('#405 interpreter parts: textio lines, math_real and report images in a VHDL test bench', () => {
  assert.deepEqual(messages('vhdl', VHDL, 'tb.vhd'), ['n=42 v=10100101', '1.414', 'time 0 ns', '165']);
});

test('#405 interpreter parts: $display\'s formats and real math in a Verilog test bench', () => {
  assert.deepEqual(messages('verilog', VERILOG, 'tb.v'), ['a=195 h=c3 b=11000011', 't=5 x=2.500000 s=ok']);
});
