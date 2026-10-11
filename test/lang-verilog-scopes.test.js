// Verilog conformance: scopes and names — hierarchical names into generate blocks and named
// blocks (IEEE 1364-2005 12.4-12.6, 1800-2017 23.6-23.9), the implicit genblk<n> names of unnamed
// generate blocks, the module's own name as a scope, arrays of instances (12.1.2), wired nets and
// supply nets in port declarations (4.6), specify blocks and specparams, parameters in functions
// and blocks, elaboration system tasks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outW, warningsOf, sim, diags } from './lang-util.js';
import { diffSynth } from './diff-synth.js';

test('hierarchical names into generate blocks: blk.x, nested blocks, upward resolution of the first name', () => {
  const r = outW(`
module tb;
  generate
    if (1) begin : Z
      if (1) begin : A
        wire x;
        if (1) begin : B
          wire x;
          if (1) begin : C
            wire x;
            assign B.x = 0;          // B: found upwards, in A
          end
          assign A.x = A.B.C.x;
        end
        assign B.C.x = 1;
      end
    end
    if (1) begin : outer
      if (1) begin : foo
        wire x = 0;
        if (1) begin : foo
          wire x = 1;
        end
      end
    end
  endgenerate
  initial #1 $display("%b %b %b %b", Z.A.x, Z.A.B.x, Z.A.B.C.x, outer.foo.x);
endmodule`);
  assert.deepEqual(r, ['1 0 1 0']);
});

test('implicit names of unnamed generate blocks: genblk<n>, n the number of the construct in its scope', () => {
  const r = sim(`
module tb;
  localparam OFF = 0;
  generate
    if (OFF) ; else wire x;
    if (!OFF) wire y;
    else ;
    if (OFF) ;
    begin : genblk4 wire w; end    // (not a generate construct; a name taken: the 4th construct's block is genblk04)
    if (1) begin wire t; end
    case (OFF) 0: begin wire u; end endcase
    for (genvar i = 0; i < 2; i = i + 1) begin wire v; end
  endgenerate
  assign genblk1.x = 0;
  assign genblk2.y = 1;
  assign genblk04.t = 1;
  assign genblk5.u = 0;
  assign genblk6[1].v = 1;
  initial #1 $display("%b%b%b%b%b", genblk1.x, genblk2.y, genblk04.t, genblk5.u, genblk6[1].v);
endmodule`);
  assert.deepEqual(warningsOf(r), []);
  assert.deepEqual(r.out, ['01101']);
  const names = r.design.signals.map(s => s.name);
  for (const n of ['genblk1.x', 'genblk2.y', 'genblk4.w', 'genblk04.t', 'genblk5.u', 'genblk6[0].v', 'genblk6[1].v']) assert.ok(names.includes(n), n);
});

test('an unnamed generate block next to an explicit genblk<n> name gets zeros after genblk', () => {
  const r = sim(`
module tb;
  wire genblk1;
  if (1) begin wire q; end
  assign genblk01.q = 1;
  assign genblk1 = 0;
  initial #1 $display("%b %b", genblk01.q, genblk1);
endmodule`);
  assert.deepEqual(warningsOf(r), []);
  assert.deepEqual(r.out, ['1 0']);
});

test('generate loops: blk[i - 1].x with a constant expression index, from the next iteration and from outside', () => {
  const r = outW(`
module tb;
  reg [7:0] a = 8'b1011_0110, b = 8'b0101_1100;
  wire [7:0] y;
  genvar i;
  generate
    for (i = 0; i < 8; i = i + 1) begin : STAGE
      wire IN1 = a[i], IN2 = b[i];
      wire C, Y;
      if (i == 0) assign C = IN1 & IN2, Y = IN1 ^ IN2;
      else assign C = (IN1 & IN2) | ((IN1 | IN2) & STAGE[i-1].C), Y = IN1 ^ IN2 ^ STAGE[i-1].C;
      assign y[i] = Y;
    end
  endgenerate
  localparam L = 7;
  initial #1 $display("%0d %b %b", y, STAGE[L].C, STAGE[L - 7].C);
endmodule`);
  // 182 + 92 = 274: y = 18, carry out of bit 7
  assert.deepEqual(r, ['18 1 0']);
});

test('a forward hierarchical reference: the generate block comes after the statement that names it', () => {
  const r = outW(`
module tb;
  wire y = blk.x ^ 1'b1;
  always @* if (blk.x) $display("x is 1");
  if (1) begin : blk
    wire x = 1;
  end
  initial #1 $display("%b", y);
endmodule`);
  assert.deepEqual(r, ['x is 1', '0']);
});

test('a declaration in a generate block is its own, even with the name of a port declared after it', () => {
  const r = outW(`
module m(x);
  generate if (1) begin : blk wire x; assign x = 0; end endgenerate
  output wire x;
  assign x = ~blk.x;
endmodule
module tb; wire x; m u(x); initial #1 $display("%b", x); endmodule`);
  assert.deepEqual(r, ['1']);
});

test('named blocks in procedures: blk.x names the block\'s variable; the module\'s name as the first name', () => {
  const r = outW(`
module tb;
  reg [7:0] o1, o2;
  parameter [7:0] V = 42;
  function automatic integer incr(input integer v); incr = v + 1; endfunction
  task send(output integer o); o = 55; endtask
  integer t;
  initial begin
    begin : blk1
      reg [7:0] x;
      x = 1;
    end
    o1 = blk1.x;
    blk2: begin
      reg [7:0] x;
      x = 2;
    end
    o2 = blk2.x;
    tb.send(t);
    $display("%0d %0d %0d %0d %0d", o1, o2, tb.V, tb.incr(4), t);
  end
endmodule`);
  assert.deepEqual(r, ['1 2 42 5 55']);
});

test('functions and tasks of a generate block: blk.f(x) and, inside it, the block\'s own ones', () => {
  const r = outW(`
module tb;
  function automatic integer f(input integer v); f = v + 1; endfunction
  if (1) begin : blk
    function automatic integer f(input integer v); f = v * 2; endfunction
    localparam D = tb.f(20), E = f(30);
    initial #1 $display("%0d %0d %0d", D, E, f(1));
  end
  initial #2 $display("%0d", blk.f(5));
endmodule`);
  assert.deepEqual(r, ['21 60 2', '10']);
});

test('instance arrays: an actual as wide as the port goes to every instance; ascending ranges; concatenations', () => {
  const r = sim(`
module aoi(input a, b, c, output y); assign y = ~((a & b) | c); endmodule
module add2(input [1:0] a, b, output [1:0] s); assign s = a + b; endmodule
module tb;
  reg a = 1; reg [3:0] b = 4'b1100, c = 4'b1010; wire [3:0] y;
  aoi p [3:0] (a, b, c, y);
  reg [5:0] x = 6'b01_10_11, z = 6'b01_01_01; wire [1:0] s0, s1, s2;
  add2 q [0:2] (.a(x), .b(z), .s({s0, s1, s2}));   // q[0]: the most significant bits
  initial #1 $display("%b %b %b %b", y, s0, s1, s2);
endmodule`);
  assert.deepEqual(warningsOf(r), []);
  assert.deepEqual(r.out, ['0001 10 11 00']);
  const insts = r.design.top.children.map(c => c.name);
  assert.deepEqual(insts, ['p[3]', 'p[2]', 'p[1]', 'p[0]', 'q[0]', 'q[1]', 'q[2]']);
});

test('wand / wor / tri0 / tri1 / supply0 / supply1 in port declarations', () => {
  const r = outW(`
module foo(input I0, I1, output O); assign O = I0 ^ I1; endmodule
module m(A, B, C, D, X, Y, Z);
  input A, B, C, D;
  output wor X;
  output wand Y;
  output Z;
  assign X = A, X = B, Y = C, Y = D;
  foo f2 (X, Y, Z);
endmodule
module vcc(output supply1 o); endmodule
module gnd(output supply0 o); endmodule
module pd(input tri0 i, output o); assign o = i; endmodule
module tb;
  reg A, B, C, D; wire X, Y, Z, one, zero, p;
  m u(A, B, C, D, X, Y, Z);
  vcc v(one); gnd g(zero); pd q(.o(p));
  initial begin
    A = 0; B = 1; C = 1; D = 0; #1 $display("%b%b%b %b%b %b", X, Y, Z, one, zero, p);
    A = 0; B = 0; C = 1; D = 1; #1 $display("%b%b%b", X, Y, Z);
  end
endmodule`, ["17: input port 'i' of 'q' is not connected"]);
  assert.deepEqual(r, ['101 10 0', '011']);
});

test('wand / wor nets with several drivers through Silinx\'s synthesis and through Yosys\'s front end', { timeout: 120000 }, async () => {
  const text = `module wandwor(A, B, C, D, X, Y, Z);
  input [3:0] A, B, C, D;
  output wor [3:0] X;
  output wand [3:0] Y;
  output Z;
  bar u (.I0({A, B}), .I1({B, A}), .O({X, Y}));
  assign X = C, X = D;
  assign Y = C, Y = D;
  assign Z = ^{X, Y};
endmodule
module bar(input [7:0] I0, I1, output [7:0] O); assign O = I0 + I1; endmodule`;
  for (const from of ['silinx', 'source']) {
    const r = await diffSynth({ name: `wandwor-${from}`, from, sources: [{ path: 'w.v', lang: 'verilog', text }], top: 'wandwor', sim: { cycles: 60 } });
    assert.equal(r.status, 'pass', `${from}: ${r.stage || ''} ${r.reason || ''}`);
  }
});

test('specify blocks and specparams are read and ignored by simulation', () => {
  const r = outW(`
module buf1(input A, output B);
  specparam a = 1;
  specify
    (A => B) = (1, 2);
    specparam [1:2] w = 1;
  endspecify
  specify specparam c = 1:2:3; endspecify
  assign B = A & (a == 1);
endmodule
module tb; reg a = 1; wire b; buf1 u(a, b); initial #1 $display("%b", b); endmodule`);
  assert.deepEqual(r, ['1']);
});

test('localparam in functions and in the named blocks of a function', () => {
  const r = outW(`
module tb;
  function integer operation;
    input integer num;
    localparam incr = 1;
    begin
      operation = 0;
      begin : op_i
        integer i;
        for (i = 0; i < 2; i = i + incr) begin : op_j
          integer j;
          localparam other_mult = 2;
          for (j = i; j < i * other_mult; j = j + incr) num = num + incr;
        end
        num = num * 2;
      end
      operation = num;
    end
  endfunction
  localparam res = operation(4);
  initial $display("%0d", res);
endmodule`);
  assert.deepEqual(r, ['10']);
});

test('elaboration system tasks in generate scopes: $info, $warning, $error', () => {
  const d = diags(`
module tb;
  localparam X = 1;
  if (X == 1) $info("X is %0d", X);
  else $error("X is not 1");
  for (genvar i = 0; i < 2; i++) if (i == 1) $warning("i = %0d", i);
endmodule`);
  assert.deepEqual(d.filter(x => /^\$/.test(x.message)).map(x => `${x.severity} ${x.message}`), ['info $info: X is 1', 'warning $warning: i = 1']);
});
