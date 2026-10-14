// Verilog / SystemVerilog constructs of #6, each simulated (a testbench prints the values): those read
// since the issue was opened (packages and import, unions, enum name ranges, const / rand, functions with
// output arguments in an expression, u.P, generate block and instance array names, localparam in a
// function, $size / $countbits / $floor, wand / wor / supply ports, structs, specify blocks) and those
// added for it: explicit port expressions (.a(x), .a({x, y})), module m(...) and identifiers starting
// with $ (Yosys extensions), automatic / static variables of a block, an output variable's initializer that is not
// constant; the errors, exact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../core/compile.js';

/** The lines the testbench prints, after checking there is no error nor warning. */
function run(dut, body) {
  const r = simulate([{ path: 'd.sv', text: dut }, { path: 'tb.sv', text: `module tb; ${body} endmodule` }], 'tb', { until: 1e7 });
  assert.deepEqual(r.errors.map(e => e.message), [], 'no error');
  assert.deepEqual((r.warnings || []).map(e => e.message), [], 'no warning');
  return r.sim.log.map(e => String(e.text).trim());
}
/** The errors of a module alone: "line:col message". */
const errorsOf = dut => simulate([{ path: 'd.v', text: dut }], 'dut', { until: 1e6 }).errors.map(e => `${e.line}:${e.col} ${e.message}`);

test('constructs of #6 read already: each simulates to its expected values', () => {
  const C = [
    ['package, import, a function of it', `package pk; localparam W = 4; typedef logic [W-1:0] w_t; function automatic w_t inc(w_t x); return x + 1; endfunction endpackage
module dut(input logic [3:0] a, output logic [3:0] y); import pk::*; assign y = inc(a); endmodule`, `reg [3:0] a = 6; wire [3:0] y; dut d(.a(a), .y(y)); initial begin #1 $display("%0d", y); end`, ['7']],
    ['pk::W in a port', `package pk; localparam W = 5; endpackage
module dut(input logic [pk::W-1:0] a, output logic [pk::W-1:0] y); assign y = a; endmodule`, `reg [4:0] a = 21; wire [4:0] y; dut d(.a(a), .y(y)); initial begin #1 $display("%0d %0d", y, $bits(y)); end`, ['21 5']],
    ['packed union', `module dut(input logic [7:0] a, output logic [7:0] y); typedef union packed { logic [7:0] b; struct packed { logic [3:0] hi, lo; } n; } u_t; u_t u; assign u.b = a; assign y = {u.n.lo, u.n.hi}; endmodule`,
      `reg [7:0] a = 8'h3c; wire [7:0] y; dut d(.a(a), .y(y)); initial begin #1 $display("%h", y); end`, ['c3']],
    ['enum name ranges S[3], B[2:4]', `module dut(input logic [1:0] a, output logic [1:0] y, output logic [2:0] z); typedef enum logic [1:0] { S[3] } e_t; typedef enum logic [2:0] { A, B[2:4], C } f_t;
  e_t s; assign s = e_t'(a); assign y = (s == S1) ? 2'd3 : (s == S2) ? 2'd2 : 2'd0; assign z = C; endmodule`, `reg [1:0] a = 1; wire [1:0] y; wire [2:0] z; dut d(.a(a), .y(y), .z(z)); initial begin #1 $display("%0d %0d", y, z); a = 2; #1 $display("%0d", y); end`, ['3 4', '2']],
    ['const and rand', `module dut(input logic [3:0] a, output logic [3:0] y); const logic [3:0] K = 4'd5; rand bit [3:0] r; assign y = a ^ K; endmodule`, `reg [3:0] a = 6; wire [3:0] y; dut d(.a(a), .y(y)); initial begin #1 $display("%0d", y); end`, ['3']],
    ['a function with an output argument in an expression', `module dut(input logic [3:0] a, output logic [3:0] y, output logic [3:0] z); function automatic logic [3:0] f(input logic [3:0] x, output logic [3:0] o); o = ~x; return x + 1; endfunction
  logic [3:0] t; always_comb begin y = f(a, t); z = t; end endmodule`, `reg [3:0] a = 6; wire [3:0] y, z; dut d(.a(a), .y(y), .z(z)); initial begin #1 $display("%0d %0d", y, z); end`, ['7 9']],
    ['u.P, an instance\'s parameter', `module sub #(parameter P = 3) (output [3:0] o); assign o = P; endmodule
module dut(output [3:0] y, output [3:0] z); sub #(5) u(.o(z)); assign y = u.P + 1; endmodule`, `wire [3:0] y, z; dut d(.y(y), .z(z)); initial begin #1 $display("%0d %0d", y, z); end`, ['6 5']],
    ['g[i].w, a name in a generate block', `module dut(input [3:0] a, output [3:0] y); genvar i; generate for (i = 0; i < 4; i = i + 1) begin : g wire w; assign w = ~a[i]; end endgenerate assign y = {g[3].w, g[2].w, g[1].w, g[0].w}; endmodule`,
      `reg [3:0] a = 6; wire [3:0] y; dut d(.a(a), .y(y)); initial begin #1 $display("%0d", y); end`, ['9']],
    ['an instance array', `module inv(input a, output y); assign y = ~a; endmodule
module dut(input [3:0] a, output [3:0] y); inv u[3:0] (.a(a), .y(y)); endmodule`, `reg [3:0] a = 6; wire [3:0] y; dut d(.a(a), .y(y)); initial begin #1 $display("%0d", y); end`, ['9']],
    ['localparam in a function', `module dut(input [3:0] a, output [3:0] y); function [3:0] f(input [3:0] x); localparam K = 3; f = x + K; endfunction assign y = f(a); endmodule`,
      `reg [3:0] a = 6; wire [3:0] y; dut d(.a(a), .y(y)); initial begin #1 $display("%0d", y); end`, ['9']],
    ['$size, $countbits, $floor, $countones', `module dut(input [7:0] a, output [3:0] y, output [3:0] z, output [3:0] w, output [3:0] v); assign y = $size(a); assign z = $countbits(a, 1'b1); assign w = $floor(2.7); assign v = $countones(a); endmodule`,
      `reg [7:0] a = 8'b10110001; wire [3:0] y, z, w, v; dut d(.a(a), .y(y), .z(z), .w(w), .v(v)); initial begin #1 $display("%0d %0d %0d %0d", y, z, w, v); end`, ['8 4 2 4']],
    ['wand, wor, supply1, supply0 ports', `module dut(input a, b, output wand y, output wor z, output supply1 one, output supply0 zero); assign y = a; assign y = b; assign z = a; assign z = b; endmodule`,
      `reg a = 1, b = 0; wire y, z, one, zero; dut d(.a(a), .b(b), .y(y), .z(z), .one(one), .zero(zero)); initial begin #1 $display("%b %b %b %b", y, z, one, zero); end`, ['0 1 1 0']],
    ['typedef struct', `module dut(input logic [7:0] a, output logic [3:0] y); typedef struct packed { logic [3:0] hi; logic [3:0] lo; } s_t; s_t s; assign s = a; assign y = s.hi ^ s.lo; endmodule`,
      `reg [7:0] a = 8'h36; wire [3:0] y; dut d(.a(a), .y(y)); initial begin #1 $display("%h", y); end`, ['5']],
    ['a specify block', `module dut(input a, output y); assign y = ~a; specify (a => y) = 1; endspecify endmodule`, `reg a = 0; wire y; dut d(.a(a), .y(y)); initial begin #5 $display("%b", y); end`, ['1']],
  ];
  for (const [what, dut, body, want] of C) assert.deepEqual(run(dut, body), want, what);
});

test('explicit port expressions: .a(x), .y({p, q}), a part of a signal, an output reg; the errors', () => {
  assert.deepEqual(run(`module dut(.a(x), .y(q)); input [3:0] x; output [3:0] q; assign q = ~x; endmodule`,
    `reg [3:0] a = 6; wire [3:0] y; dut d(.a(a), .y(y)); initial begin #1 $display("%0d", y); end`), ['9']);
  // concatenations, in and out; a part-select; an output declared reg after
  assert.deepEqual(run(`module dut(.a({x1, x0}), .y({q0, q1}), .s(r[3:2]), .t(u), clk); input [1:0] x1, x0; output [1:0] q0, q1; input [3:0] r; output u; input clk;
  reg [1:0] q0; assign q1 = x0; assign u = r[3] & ~r[2]; always @(posedge clk) q0 <= x1; endmodule`,
  `reg [3:0] a = 4'b0110; reg [1:0] s = 2'b10; reg clk = 0; wire [3:0] y; wire t; dut d(.a(a), .y(y), .s(s), .t(t), .clk(clk)); initial begin #1 clk = 1; #1 $display("%b %b", y, t); end`), ['0110 1']);
  assert.deepEqual(errorsOf(`module dut(.a(x), .b()); input x; endmodule`), ["1:20 port 'b': an unconnected explicit port .b() is not supported"]);
  assert.deepEqual(errorsOf(`module dut(.a(x)); inout x; endmodule`), ["1:13 port 'a': an explicit inout port is not supported"]);
  assert.deepEqual(errorsOf(`module dut(.a({x, y})); input x; output y; endmodule`), ["1:13 port 'a': its signals have different directions"]);
  assert.deepEqual(errorsOf(`module dut(.a(x + 1)); input x; endmodule`), ["1:13 port 'a': an explicit port is a signal, a part of one or a concatenation of them", "1:30 'x' is not in the port list"]);
  assert.deepEqual(errorsOf(`module dut(.a(x)); wire x; endmodule`), ["1:13 port 'a' has no direction declaration"]);
});

test('module m(...) (Yosys): the ports are the inputs and outputs the body declares, in their order', () => {
  assert.deepEqual(run(`module dut(...); parameter W = 4; input [W-1:0] a; output reg [W-1:0] y; input b; always @* y = b ? ~a : a; endmodule`,
    `reg [3:0] a = 6; reg b = 1; wire [3:0] y; dut d(.a(a), .y(y), .b(b)); initial begin #1 $display("%0d", y); b = 0; #1 $display("%0d", y); end`), ['9', '6']);
  // by position: a, y, b
  assert.deepEqual(run(`module dut(...); input [3:0] a; output [3:0] y; input b; assign y = b ? ~a : a; endmodule`,
    `reg [3:0] a = 6; wire [3:0] y; dut d(a, y, 1'b1); initial begin #1 $display("%0d", y); end`), ['9']);
});

test('identifiers starting with $ (Yosys): a wire, a register written in a process, a module and its instance; $time still the system function', () => {
  assert.deepEqual(run(`module $__inv(input a, output y); assign y = ~a; endmodule
module dut(input clk, input [3:0] a, output reg [3:0] y, output z); reg [3:0] $r; wire $w; wire [3:0] $tmp = ~a;
  always @(posedge clk) begin $r = a + 1; $r[0] <= 1'b0; y <= $r ^ $tmp ^ $tmp; end
  $__inv u(.a(a[0]), .y($w)); assign z = $w; endmodule`,
  `reg clk = 0; reg [3:0] a = 6; wire [3:0] y; wire z; dut d(.clk(clk), .a(a), .y(y), .z(z)); initial begin #1 clk = 1; #1 $display("%0d %b %0t", y, z, $time); end`), ['7 1 2']);
});

test('automatic / static variables of a block, an automatic function\'s; an output variable\'s initializer that is not constant', () => {
  const tb = `reg clk = 0; reg [3:0] a = 6; wire [3:0] y; dut d(.clk(clk), .a(a), .y(y)); initial begin #1 clk = 1; #1 $display("%0d", y); a = 9; #1 clk = 0; #1 clk = 1; #1 $display("%0d", y); end`;
  // automatic: initialized at each entry
  assert.deepEqual(run(`module dut(input clk, input [3:0] a, output reg [3:0] y); always @(posedge clk) begin : b automatic logic [3:0] t = a + 1; y <= t; end endmodule`, tb), ['7', '10']);
  assert.deepEqual(run(`module dut(input clk, input [3:0] a, output reg [3:0] y); function automatic [3:0] f(input [3:0] x); reg [3:0] t = x + 1; f = t; endfunction always @(posedge clk) y <= f(a); endmodule`, tb), ['7', '10']);
  // static (implicit or not), a constant: once, before time 0 (the second edge: 4, then 5)
  assert.deepEqual(run(`module dut(input clk, input [3:0] a, output reg [3:0] y); always @(posedge clk) begin : b logic [3:0] t = 4'd3; t = t + 1; y <= t; end endmodule`, tb), ['4', '5']);
  assert.deepEqual(run(`module dut(input clk, input [3:0] a, output reg [3:0] y); always @(posedge clk) begin : b static logic [3:0] t = 4'd3; t = t + 1; y <= t; end endmodule`, tb), ['4', '5']);
  // static, not constant: refused (IEEE 1800-2017 6.21; Yosys reads none of these)
  const msg = "'t': a static variable of a block or a subprogram is initialized once, before time 0: its initializer must be constant; declare it automatic to initialize it at each entry (IEEE 1800-2017 6.21)";
  assert.deepEqual(errorsOf(`module dut(input clk, input [3:0] a, output reg [3:0] y); always @(posedge clk) begin : b static logic [3:0] t = a; y <= t; end endmodule`), [`1:110 ${msg}`]);
  assert.deepEqual(errorsOf(`module dut(input clk, input [3:0] a, output reg [3:0] y); always @(posedge clk) begin : b logic [3:0] t = a; y <= t; end endmodule`), [`1:103 ${msg}`]);
  // output integer q = off + 3: evaluated once at time 0 (Yosys's various/fib.v); a constant one stays an initial value
  assert.deepEqual(run(`module dut(off, q, r); input wire signed [31:0] off; output integer q = off + 3; output reg [3:0] r = 5; endmodule`,
    `reg signed [31:0] o = 10; wire [31:0] q; wire [3:0] r; dut d(.off(o), .q(q), .r(r)); initial begin #1 $display("%0d %0d", q, r); o = 20; #1 $display("%0d %0d", q, r); end`), ['13 5', '13 5']);
});
