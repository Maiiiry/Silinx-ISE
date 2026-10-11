// Verilog conformance: SystemVerilog data types and system functions the parser and elaborator
// read (IEEE 1800-2017): typedefs, enumerations, packed structures, multi-dimensional packed
// arrays, unpacked dimensions [N], declarations in the compilation unit, immediate assertions,
// array query functions ($size, $left…), $countbits / $onehot / $isunknown, real math functions
// ($floor, $ceil…), the preprocessor's macro forms (`` pasting, default arguments, a macro joined
// to the text around it), compound assignment operators, strings as values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outW, warningsOf, sim, vinit, vlog, diags } from './lang-util.js';
import { diffSynth } from './diff-synth.js';

test('typedefs of vectors and enumerations: values, widths, names as constants', () => {
  const r = outW(`
typedef logic [7:0] byte_t;
module tb;
  typedef enum logic [1:0] { IDLE, RUN = 2, STOP } state_t;
  typedef enum { A, B, C = 7, D } e_t;
  byte_t v = 8'hA5;
  state_t s = STOP;
  e_t e = D;
  int i = -3;
  byte b = -1;
  bit [3:0] n = 4'b1001;
  initial $display("%h %0d %0d %0d %0d %0d %0d %b %0d", v, $bits(v), s, $bits(state_t), e, $bits(e), i, n, b);
endmodule`);
  assert.deepEqual(r, ['a5 8 3 2 8 32 -3 1001 -1']);
});

test('packed structures: members, nested members, members of parameters and localparams', () => {
  const r = outW(`
module tb;
  typedef struct packed { logic a; logic b; } sub_sub_t;
  typedef struct packed { sub_sub_t c; } sub_t;
  typedef struct packed { sub_t d; sub_t e; } struct_t;
  parameter struct_t P = 4'b1100;
  localparam sub_t f = P.d;
  localparam logic i = P.d.c.a;
  localparam y = P.e.c;
  struct packed { logic [3:0] hi; logic [3:0] lo; } w;
  initial begin
    w = 8'h5A;
    w.lo = 4'h3;
    w.hi[0] = 1'b0;
    $display("%b %b %b %b %h %h %0d", P, f, i, y, w, w.hi, $bits(w));
  end
endmodule`);
  assert.deepEqual(r, ['1100 11 1 00 43 4 8']);
});

test('multi-dimensional packed arrays: logic [0:3][7:0], arrays of typedefs, element selects', () => {
  const r = outW(`
typedef logic [7:0] reg8_t;
typedef reg8_t [0:3] reg2dim_t;
module tb;
  logic [0:3][7:0] p = 32'h11223344;
  reg2dim_t q = 32'hAABBCCDD;
  logic [3:0][1:0] r;
  integer k;
  initial begin
    r = 8'b11_10_01_00;
    for (k = 0; k < 4; k = k + 1) $write("%h ", p[k]);
    k = 2;
    r[k] = 2'b00; r[0][1] = 1'b1;
    $display("%h %h %b %b %0d %0d", q[1], q[k], r, r[3], $size(p), $size(p, 2));
  end
endmodule`);
  assert.deepEqual(r, ['11 22 33 44 bb cc 11000110 11 4 8']);
});

test('unpacked dimensions [N]: N elements, 0 to N - 1', () => {
  const r = outW(vinit(`
    for (k = 0; k < 16; k = k + 1) memory[k] = k * 3;
    $display("%0d %0d %0d %0d", memory[0], memory[15], $left(memory), $right(memory));`,
  `reg [7:0] memory [16]; integer k;`));
  assert.deepEqual(r, ['0 45 0 15']);
});

test('array queries: $left $right $low $high $size $increment $dimensions of vectors and arrays', () => {
  const r = outW(vinit(`
    $display("%0d %0d %0d %0d %0d %0d", $left(v), $right(v), $low(v), $high(v), $size(v), $increment(v));
    $display("%0d %0d %0d %0d %0d", $left(m), $right(m), $size(m), $size(m, 2), $dimensions(m));
    case ($size(out)) 6: $display("six"); endcase`,
  `logic [2:7] v; reg [3:0] m [10:1]; logic [5:0] out;`));
  assert.deepEqual(r, ['2 7 2 7 6 -1', '10 1 10 4 2', 'six']);
});

test('$countbits, $countones, $onehot, $onehot0, $isunknown (x and z bits included)', () => {
  const r = outW(vinit(`
    $display("%0d %0d %0d %0d", $countbits(15'b011xxxxzzzzzzzz, '0), $countbits(15'b011xxxxzzzzzzzz, '1), $countbits(15'b011xxxxzzzzzzzz, 'x), $countbits(15'b011xxxxzzzzzzzz, 'z));
    $display("%0d %0d %0d", $countbits(15'b011xxxxzzzzzzzz, '1, 'x, 'z, '0), $countbits(0, '0), $countbits(80'bx0, 'x));
    v = 8'b1010_x001;
    $display("%0d %b %b %b %b %b", $countones(v), $onehot(8'h20), $onehot(8'h21), $onehot0(8'h00), $isunknown(v), $isunknown(8'h12));
    one = $countbits(3'b100, '1) & 1'b1; two = $countbits(3'b111, '1) & 2'b11;
    $display("%0d %0d", one, two);`,
  `reg [7:0] v; logic one; logic [1:0] two;`));
  assert.deepEqual(r, ['1 2 4 8', '15 32 79', '3 1 0 1 1 0', '1 3']);
});

test('real math functions of constants: $floor, $ceil, $sqrt, $pow, $ln; a parameter declared signed without a range', () => {
  const r = outW(`
module tb;
  parameter W = 10, X = 3;
  localparam signed Y = $floor(W / X);
  localparam signed Z = $ceil(7.2);
  localparam real R = $sqrt(16.0) + $pow(2, 3) + $ln(1.0);
  localparam signed S = 4'sb1110;
  initial $display("%0d %0d %0.1f %0d %0d", Y, Z, R, S, $bits(S));
endmodule`);
  assert.deepEqual(r, ['3 8 12.0 -2 4']);
});

test('strings as values: a string parameter passed to a function, sliced, compared, assigned', () => {
  const r = outW(`
module tb;
  parameter OUTPUT = "FOO";
  function automatic [23:0] flip(input [23:0] inp); flip = ~inp; endfunction
  wire [23:0] a = OUTPUT;
  initial #1 $display("%s %0d %0d %0d %s", a, flip(OUTPUT) == flip("FOO"), OUTPUT[15:8] == "O", OUTPUT == "BAR", OUTPUT[7:0] == "O" ? "yes" : "no");
endmodule`);
  assert.deepEqual(r, ['FOO 1 1 0 yes']);
});

test('immediate assertions: assert (e), assert (e) else …, labels; concurrent assertions are ignored', () => {
  const r = sim(`
module tb;
  reg [3:0] a = 4;
  assert property (a == 4);
  initial begin
    assert (a == 4);
    assert (a == 5) else $display("a is not 5");
    chk: assert (a == 3);
    assert (a == 4) $display("pass");
    $finish;
  end
endmodule`, 'tb', { allowErrors: true });
  assert.deepEqual(warningsOf(r), []);
  assert.deepEqual(r.out, ['a is not 5', 'Assertion violation.', 'pass']);
  assert.deepEqual(r.log.filter(l => l.kind === 'error').map(l => l.text), ['Assertion violation.']);
});

test('function and task ports without a direction take the one before (input first)', () => {
  const r = outW(`
module tb;
  function automatic integer bar(integer a); bar = 2 ** a; endfunction
  task automatic foo(input integer a, integer b, output integer c, integer d);
    c = a + b + 1; d = 51;
  endtask
  integer w, x, y;
  initial begin w = bar(4); foo(1, 2, x, y); $display("%0d %0d %0d", w, x, y); end
endmodule`);
  assert.deepEqual(r, ['16 4 51']);
});

test('the compilation unit: typedefs and functions outside modules', () => {
  const r = outW(`
function [7:0] do_add;
  input [7:0] a, b;
  do_add = a + b;
endfunction
typedef struct packed { logic [3:0] x; logic [3:0] y; } pair_t;
localparam K = 3;
module tb;
  pair_t p = 8'h12;
  initial $display("%0d %0d", do_add (* combinational *) (p.x, p.y), K);
endmodule`);
  assert.deepEqual(r, ['3 3']);
});

test('an output net with a value is a continuous assignment; an output variable with one starts at it', () => {
  const r = outW(`
module m(input [3:0] sel, output wire [3:0] out = sel + 1, output integer v = 7);
endmodule
module m2(sel, out); input [3:0] sel; output wire [3:0] out = ~sel; endmodule
module tb;
  reg [3:0] s = 2; wire [3:0] o, o2; wire [31:0] v;
  m u(s, o, v); m2 u2(s, o2);
  initial begin #1 $display("%0d %0d %0d", o, o2, v); s = 5; #1 $display("%0d %0d", o, o2); end
endmodule`);
  assert.deepEqual(r, ['3 13 7', '6 10']);
});

test('compound assignment operators: *= /= %= <<= >>= <<<= >>>=', () => {
  const r = outW(vinit(`
    a = 6; a *= 3; $write("%0d ", a); a /= 4; $write("%0d ", a); a %= 3; $write("%0d ", a);
    a <<= 3; $write("%0d ", a); a >>= 1; $write("%0d ", a);
    s = -16; s >>>= 2; $write("%0d ", s); s <<<= 1; $display("%0d", s);`,
  `reg [7:0] a; reg signed [7:0] s;`));
  assert.deepEqual(r, ['18 4 1 8 4 -4 -8']);
});

test('macros: `` pasting, default arguments, multi-line bodies, a macro joined to the text around it', () => {
  const r = outW(`
\`define SIZE 4 // a comment
\`define parvez ahmad
\`define TEST(name, op) \\
  module test_\`\`name(input [3:0] a, b, output reg [3:0] c); \\
    always @* begin c = a; c op b; end \\
  endmodule
\`TEST(add, +=)
\`TEST(bit_or , |=)
\`define FOO(a = f) a
\`define MACRO(dummy, x) IDENT_\`\`x\`\`_
module tb;
  wire [\`SIZE-1:0] x = \`SIZE'ha;
  wire f4_\`parvez = 1'b1;
  wire [3:0] c1, c2;
  test_add u1(4'd3, 4'd4, c1);
  test_bit_or u2(4'b0101, 4'b0011, c2);
  wire \`MACRO(_, W) = 1'b0;
  wire \`FOO() = 1'b1, \`FOO(g) = 1'b0;
  initial #1 $display("%b %b %0d %b %b %b %b", x, f4_ahmad, c1, c2, IDENT_W_, f, g);
endmodule`);
  assert.deepEqual(r, ['1010 1 7 0111 0 1 0']);
});

test('a macro used with fewer arguments than it has (and no defaults) is an error', () => {
  const d = diags('`define F(a, b) a + b\nmodule tb; wire x = `F(1); endmodule\n');
  assert.ok(d.some(x => /macro `F expects 2 argument/.test(x.message)), JSON.stringify(d));
});

test('a parameter of the port list without a default: the instance gives it', () => {
  const r = outW(`
module foo #(parameter [1:0] a) (output [1:0] o); assign o = a; endmodule
module tb; wire [1:0] o; foo #(2'b10) u(o); initial #1 $display("%b", o); endmodule`);
  assert.deepEqual(r, ['10']);
});

test('structures, packed arrays and enumerations through Silinx\'s synthesis and Yosys\'s front end', { timeout: 120000 }, async () => {
  const text = `typedef logic [7:0] reg8_t;
module pck(input clk, input logic [0:3][7:0] in, input [1:0] ix, input [7:0] d, output reg8_t out, output [3:0] cnt, output [7:0] w);
  typedef enum logic [1:0] { S0, S1, S2 } st_t;
  typedef struct packed { logic [3:0] hi; logic [3:0] lo; } pair_t;
  st_t st = S0;
  pair_t p;
  always_ff @(posedge clk) begin
    out <= in[ix];
    st <= st == S2 ? S0 : st_t'(st + 1);
  end
  always_comb begin p = d; p.lo = p.hi ^ p.lo; end
  assign w = p;
  assign cnt = $countones(d) + st;
endmodule`;
  for (const from of ['silinx', 'source']) {
    const r = await diffSynth({ name: `sv-${from}`, from, sources: [{ path: 'p.sv', lang: 'verilog', text }], top: 'pck', sim: { cycles: 60 } });
    assert.equal(r.status, 'pass', `${from}: ${r.stage || ''} ${r.reason || ''}`);
  }
});

test('a function argument declared again (input [4:0] r; reg [4:0] r; / input x; integer x;) is the argument', () => {
  const r = outW(`
module tb;
  function automatic [31:0] op(input [4:0] rounds, input integer num);
    reg [4:0] rounds;
    integer i;
    begin
      begin : shadow integer rounds; rounds = 0; end
      for (i = 0; i < rounds; i = i + 1) num = num * 2;
      op = num;
    end
  endfunction
  function automatic integer op5; input x; integer x; op5 = x; endfunction
  initial $display("%0d %0d", op(3, 2), op5(64));
endmodule`);
  assert.deepEqual(r, ['16 64']);
});
