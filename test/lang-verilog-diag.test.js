// Verilog diagnostics: syntax errors, elaboration errors and warnings for common mistakes, with
// the line / column they are reported at and their message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diags, sim } from './lang-util.js';

const list = (src, sev, top = 'tb') => diags(src, top, { lang: 'verilog' }).filter(d => d.severity === sev).map(d => `${d.line}:${d.col} ${d.message}`);
const errs = (src, top) => list(src, 'error', top);
const warns = (src, top) => list(src, 'warning', top);

test('a missing semicolon at the end of a line is reported there, without follow-on errors', () => {
  assert.deepEqual(errs('module tb;\n  reg a\n  initial a = 1;\nendmodule\n'), ["2:8 expected ';' after 'a'"]);
  assert.deepEqual(errs('module tb;\n  reg a;\n  initial begin\n    a = 1\n    a = 0;\n  end\nendmodule\n'), ["4:10 expected ';' after '1'"]);
});

test('syntax errors: missing endmodule, unexpected tokens, bad characters, unterminated strings', () => {
  assert.deepEqual(errs('module tb;\n  initial begin\n    $display("x");\n  end\n'), ["5:1 expected 'endmodule' but found 'eof'"]);
  assert.equal(errs('module tb;\n  reg a;\n  initial a = 1 § 2;\nendmodule\n')[0], "3:17 unexpected character '§'");
  assert.equal(errs('module tb;\n  initial $display("abc);\nendmodule\n')[0], '2:20 unterminated string');
  assert.equal(errs('module tb;\n  wire w;\n  assign w = (1 + ;\nendmodule\n')[0], "3:19 unexpected ';' in expression");
});

test('undeclared identifiers in procedural code are errors; undeclared continuous-assignment targets are implicit nets (warning)', () => {
  assert.deepEqual(errs('module tb;\n  initial begin\n    x = 1;\n  end\nendmodule\n'), ["3:5 'x' is not declared"]);
  assert.deepEqual(errs('module tb;\n  assign y = 1\'b1;\nendmodule\n'), []);
  assert.deepEqual(warns('module tb;\n  assign y = 1\'b1;\nendmodule\n'), ["2:10 implicit net 'y' (declare it with 'wire')"]);
});

test('module instantiation errors: unknown module, unknown port, too many connections, unknown parameter; unconnected input warning', () => {
  assert.deepEqual(errs('module tb;\n  foo u1 (.a(1\'b0));\nendmodule\n'), ["2:3 module/entity 'foo' not found (instance 'u1')"]);
  const sub = 'module sub #(parameter P = 1) (input a, output y); assign y = a; endmodule\n';
  assert.deepEqual(errs(sub + 'module tb;\n  wire s;\n  sub u1 (.b(s));\nendmodule\n'), ["4:3 module 'sub' has no port 'b'"]);
  assert.deepEqual(errs(sub + 'module tb;\n  wire s, t, u;\n  sub u1 (s, t, u);\nendmodule\n'), ["4:3 too many port connections for 'sub'"]);
  assert.deepEqual(errs(sub + 'module tb;\n  wire s, t;\n  sub #(.Q(2)) u1 (s, t);\nendmodule\n'), ["4:3 module 'sub' has no parameter 'Q'"]);
  assert.deepEqual(warns(sub + 'module tb;\n  wire y;\n  sub u1 (.y(y));\nendmodule\n'), ["4:3 input port 'a' of 'u1' is not connected"]);
});

test('preprocessor diagnostics: undefined macros, missing `endif, `include of a missing file', () => {
  assert.equal(errs('module tb;\n  initial $display("%d", `NOPE);\nendmodule\n')[0], '2:26 undefined macro `NOPE');
  assert.deepEqual(errs('`ifdef A\nmodule tb; endmodule\n'), ['3:1 missing `endif']);
  assert.deepEqual(errs('`include "nothere.vh"\nmodule tb; endmodule\n'), ["1:1 `include file 'nothere.vh' not found in the project"]);
});

test('functions and tasks: undeclared function, task used as a function', () => {
  assert.deepEqual(errs('module tb;\n  initial $display("%d", f(1));\nendmodule\n'), ["2:11 function 'f' is not declared"]);
  assert.deepEqual(errs('module tb;\n  task t; begin end endtask\n  initial $display("%d", t(1));\nendmodule\n'), ["3:11 't' is a procedure/task, not a function"]);
  assert.deepEqual(errs('module tb;\n  initial nosuch(1);\nendmodule\n'), ["2:11 task/procedure 'nosuch' is not declared"]);
});

test('run-time errors: an always block without timing control, a combinational loop', () => {
  let r = sim('module tb; integer n = 0; always n = n + 1; endmodule', 'tb', { allowErrors: true });
  assert.match(r.log.find(l => l.kind === 'error').text, /loops forever without waiting/);
  r = sim('module tb; wire a; assign a = ~a; initial #1 $finish; endmodule', 'tb', { allowErrors: true });
  // ~x is x: the loop settles (no oscillation) and the simulation ends normally
  assert.equal(r.r.status.finished, 'finish');
  r = sim('module tb; reg a = 0; always @(a) a = ~a; initial #1 a = 1; endmodule', 'tb', { allowErrors: true });
  assert.equal(r.r.status.now, 1e9);
});

test('$fatal / $error / $warning / $info severities', () => {
  const r = sim('module tb; initial begin $info("i %0d", 1); $warning("w"); $error("EXP e"); $fatal(1, "EXP f"); $display("never"); end endmodule', 'tb', { allowErrors: true });
  assert.deepEqual(r.lines.filter(l => !/simulation/.test(l)), ['0 note i 1', '0 warning w', '0 error EXP e', '0 failure EXP f']);
  assert.equal(r.r.status.finished, 'fatal');
});

test('based literals: a digit outside the base is an error at the literal, never a crash or a wrong value (#395)', () => {
  const at = lit => errs(`module tb;\n  wire [7:0] y = ${lit};\nendmodule\n`);
  // (before: 8'dA threw "Cannot convert a to a BigInt" out of compile(); 4'b12, 8'o9, 8'd1x, 4'b gave wrong values)
  assert.deepEqual(at("8'dA"), ["2:18 bad number literal 8'dA: 'a' is not a decimal digit"]);
  assert.deepEqual(at("4'b12"), ["2:18 bad number literal 4'b12: '2' is not a binary digit"]);
  assert.deepEqual(at("8'o9"), ["2:18 bad number literal 8'o9: '9' is not an octal digit"]);
  assert.deepEqual(at("8'd1x"), ["2:18 bad number literal 8'd1x: x, z or ? in a decimal number must be its only digit"]);
  assert.deepEqual(at("4'b"), ["2:18 bad number literal 4'b: no digits"]);
  assert.deepEqual(at("'b2"), ["2:18 bad number literal 'b2: '2' is not a binary digit"]);
  // the valid ones: no error, and their value
  for (const lit of ["8'hFF", "8'dx", "8'd?", "8'd255", "4'b10?z", "'h1F", "8'sd5", "16'hx_ff", "8'o377", "8'b1010_1010", "8 'h A5"]) assert.deepEqual(at(lit), [], lit);
  const r = sim("module tb;\n  wire [7:0] a = 8'd200, b = 8'b1010_0101, c = 8'o17;\n  wire [11:0] d = 12'hxF;\n  initial #1 $display(\"%d %b %d %b\", a, b, c, d);\nendmodule\n", 'tb', { lang: 'verilog' });
  assert.deepEqual(r.out, ['200 10100101  15 xxxxxxxx1111']);
});
