// Silinx HLS, the state machine as an ASM chart (#1575): core/c-asm.js (and core/c-print.js, the C written back). A
// sequential function's chart: the protocol's IDLE and DONE, a state per block of the C with its statements, its ifs
// decision boxes and the statements under them conditional outputs, a return / break / continue its jump, a memory's
// accesses; each state of the machine (core/c-fsmd.js) one state of the chart; laid out (every box placed). A
// combinational function has none: said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cAsm } from '../core/c-asm.js';
import { exprText, stmtText } from '../core/c-print.js';
import { parse } from '../core/c-parse.js';
import { cToHdl } from '../core/c-hdl.js';
import { normalizeModel } from '../core/asm.js';

/** The chart as lines: a box 'name or condition [actions]', then each connection 'from -port-> to'. */
function lines(model) {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const lbl = (n) => (n.type === 'state' ? n.name : n.type === 'decision' ? `<${n.cond}>` : `(${n.actions.join('; ')})`);
  return model.edges.map((e) => `${lbl(byId.get(e.from))} -${e.port}-> ${lbl(byId.get(e.to))}`);
}

test('#1575 C written back: precedence, unary, casts, calls, indexes, assignments, declarations', () => {
  const e = (src) => exprText(parse(`void f(void) { x = ${src}; }`).items[0].body.items[0].e.r);
  assert.equal(e('a + b * (c - 1)'), 'a + b * (c - 1)');
  assert.equal(e('(a + b) * c'), '(a + b) * c');
  assert.equal(e('a - (b - c)'), 'a - (b - c)');
  assert.equal(e('a - b - c'), 'a - b - c');
  assert.equal(e('-(-a)'), '-(-a)');
  assert.equal(e('!(a && b) || c ? t[i + 1] : (unsigned char)g(a, b)'), '!(a && b) || c ? t[i + 1] : (unsigned char)g(a, b)');
  assert.equal(e('x.range(7, 4)'), 'x.range(7, 4)');
  const s = parse('void f(void) { int k = 3, m; s += a[i]++; return; }').items[0].body.items;
  assert.deepEqual(s.map(stmtText), ['int k = 3; int m', 's += a[i]++', 'return']);
});

const GCD = `unsigned gcd(unsigned a, unsigned b) {
  while (b != 0) {
#pragma HLS LOOP_TRIPCOUNT max=64
    unsigned t = b;
    b = a >= b ? a - b : b - a;
    a = t;
    if (b > a) { t = a; a = b; b = t; }
  }
  return a;
}
`;

test('#1575 the ASM chart of a sequential function: IDLE, the arguments read on ap_start, a state per block with its statements, the loop\'s condition and an if as decisions, DONE; a state per state of the machine', () => {
  const r = cAsm(GCD, { file: 'gcd.c' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(lines(r.model), [
    'IDLE -next-> <ap_start>', '<ap_start> -true-> (read a, b)', '(read a, b) -next-> S1', '<ap_start> -false-> IDLE', 'DONE -next-> IDLE',
    'S1 -next-> <b != 0>', '<b != 0> -true-> S2', '<b != 0> -false-> S3',
    'S2 -next-> <b > a>', '<b > a> -true-> (t = a; a = b; b = t)', '(t = a; a = b; b = t) -next-> S1', '<b > a> -false-> S1',
    'S3 -next-> DONE',
  ]);
  const st = (n) => r.model.nodes.find((x) => x.name === n);
  assert.deepEqual(st('S2').actions, ['unsigned t = b', 'b = a >= b ? a - b : b - a', 'a = t']);
  assert.deepEqual(st('S3').actions, ['ap_return = a']);
  assert.deepEqual(st('IDLE').actions, ['ap_idle = 1']);
  assert.deepEqual(st('DONE').actions, ['ap_done = 1', 'ap_ready = 1']);
  // as many states as the machine has (IDLE and DONE with them)
  assert.equal(r.model.nodes.filter((n) => n.type === 'state').length, cToHdl(GCD, { file: 'gcd.c' }).states);
  // every box placed, apart; the model as core/asm.js reads it
  const pos = r.model.nodes.map((n) => `${n.x},${n.y}`);
  assert.equal(new Set(pos).size, pos.length);
  assert.ok(r.model.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
  assert.equal(normalizeModel(r.model).nodes.length, r.model.nodes.length);
  assert.deepEqual(r.model.registers.map((x) => `${x.name}:${x.width}`), ['a:32', 'b:32', 't:32', 'ap_return:32']);
});

test('#1575 a return, break and continue inside a block\'s ifs: their jumps; a memory\'s accesses; an unrolled loop in its state; a combinational function: no chart', () => {
  const r = cAsm(`int find(int a[8], int x) {
  int k = 0;
  for (int i = 0; i < 8; i++) {
    int v = a[i];
    if (v == x) return i;
    if (v < 0) break;
    if (v == 0) continue;
    k++;
  }
  for (int j = 0; j < 4; j++) {
#pragma HLS UNROLL
    k += j;
  }
  return -k;
}
`, { file: 'find.c' });
  assert.equal(r.ok, true);
  const L = lines(r.model);
  assert.ok(L.includes('(ap_return = i) -next-> DONE'), L.join('\n'));
  const states = r.model.nodes.filter((n) => n.type === 'state');
  const acts = states.flatMap((n) => n.actions);
  assert.ok(acts.includes('a_address0 = i; a_ce0 = 1'), acts.join('\n'));
  assert.ok(acts.includes('ap_mem_a_0 = a_q0'), acts.join('\n'));
  assert.ok(acts.includes('for (…) unrolled: k += j'), acts.join('\n'));
  // break: to the state after the loop; continue: to its step
  const byId = new Map(r.model.nodes.map((n) => [n.id, n]));
  const after = (cond, port) => byId.get(r.model.edges.find((e) => byId.get(e.from).cond === cond && e.port === port).to);
  assert.equal(after('v < 0', 'true').type, 'state');
  assert.equal(after('v == 0', 'true').type, 'state');
  assert.notEqual(after('v < 0', 'true').name, after('v == 0', 'true').name);
  assert.equal(r.model.nodes.filter((n) => n.type === 'state').length, cToHdl(`int find(int a[8], int x) {\n  int k = 0;\n  for (int i = 0; i < 8; i++) {\n    int v = a[i];\n    if (v == x) return i;\n    if (v < 0) break;\n    if (v == 0) continue;\n    k++;\n  }\n  for (int j = 0; j < 4; j++) {\n#pragma HLS UNROLL\n    k += j;\n  }\n  return -k;\n}\n`).states);
  const comb = cAsm('int f(int a) { return a + 1; }');
  assert.equal(comb.ok, false);
  assert.deepEqual(comb.diagnostics.map((d) => d.message), ["'f' is combinational: it has no state machine"]);
});
