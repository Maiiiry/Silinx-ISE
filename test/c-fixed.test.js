// Silinx HLS (#1643): ap_fixed<W, I, Q, O> / ap_ufixed in the C simulation (core/c-fixed.js), against AMD's
// ap_fixed.h (test/ap-int-ref.js): the types of the results, the seven quantization and four overflow modes,
// conversions from doubles and to integers (toward zero), comparisons as AMD's ap_private compares mixed signs,
// shifts, to_double / to_int, C++'s cout of a fixed value (its precision); a program, then random ones (types, modes,
// operators). Not synthesized yet: said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cToHdl } from '../core/c-hdl.js';
import { apIntHeaders, runWithApInt } from './ap-int-ref.js';

const AP = await apIntHeaders();
const errs = (src) => cToHdl(src, { file: 'e.cpp' }).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line} ${d.message}`);

const FIXED = `#include <iostream>
#include <iomanip>
#include "ap_fixed.h"
using namespace std;
typedef ap_fixed<16, 6> a_t;
typedef ap_ufixed<10, 3, AP_RND, AP_SAT> u_t;
int scale(int x) { return x * 2; }
int main() {
  a_t a = 3.141592653589793, b = -2.718281828;
  u_t u = 6.99999;
  ap_fixed<8, 4, AP_RND_CONV, AP_SAT_SYM> c = -9.5;
  cout << a << " " << b << " " << u << " " << c << endl;
  cout << a + b << " " << a - b << " " << a * b << " " << a / b << " " << (a & b) << endl;
  a_t d = a * b;
  cout << d << " " << d.to_double() << " " << d.to_int() << " " << (int)b << " " << -a << endl;
  for (int i = 0; i < 6; i++) {
    a_t x = i * 0.37 - 1;
    ap_fixed<6, 3, AP_RND> r1 = x; ap_fixed<6, 3, AP_TRN_ZERO> r2 = x; ap_fixed<6, 3, AP_RND_ZERO> r3 = x;
    ap_fixed<6, 3, AP_RND_MIN_INF> r4 = x; ap_fixed<6, 3, AP_RND_INF> r5 = x; ap_fixed<6, 3> r6 = x;
    cout << x << " " << r1 << " " << r2 << " " << r3 << " " << r4 << " " << r5 << " " << r6 << endl;
  }
  ap_fixed<4, 2, AP_TRN, AP_SAT_ZERO> z = 5; ap_ufixed<4, 2, AP_TRN, AP_SAT> s = -1;
  cout << z << " " << s << " " << (a > b) << " " << (a == 3) << " " << (a << 2) << " " << (b >> 1) << endl;
  a_t acc = 0;
  for (int i = 0; i < 10; i++) acc += a_t(0.1) * i;
  cout << setprecision(10) << acc << " " << setprecision(3) << acc << " " << acc * 1000000 << " " << a_t(0.0001) << endl;
  printf("%.6f %d\\n", acc.to_double(), scale(acc.to_int()));
  return 0;
}
`;

/** A program of n random cases (seeded): two ap_fixed / ap_ufixed of random widths, integer bits and modes, an
 *  operator, the result in a third type; printed by cout (30 digits) and printf of to_double. */
function genFixed(seed, n) {
  let s = seed >>> 0 || 1;
  const r = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const pick = (a) => a[Math.floor(r() * a.length)];
  const Q = ['AP_RND', 'AP_RND_ZERO', 'AP_RND_MIN_INF', 'AP_RND_INF', 'AP_RND_CONV', 'AP_TRN', 'AP_TRN_ZERO'];
  const O = ['AP_SAT', 'AP_SAT_ZERO', 'AP_SAT_SYM', 'AP_WRAP'];
  const ty = () => { const w = 2 + Math.floor(r() * 30); const i = 1 + Math.floor(r() * w); return `ap_${r() < 0.7 ? '' : 'u'}fixed<${w}, ${i}, ${pick(Q)}, ${pick(O)}>`; };
  const val = () => ((r() - 0.5) * 2 ** Math.floor(r() * 12 - 4)).toPrecision(8);
  const L = ['#include <iostream>', '#include <iomanip>', '#include <cstdio>', '#include "ap_fixed.h"', 'using namespace std;', 'int id(int x) { return x; }', 'int main() {', '  cout << setprecision(30);'];
  for (let k = 0; k < n; k++) {
    const op = pick(['+', '-', '*', '/', '&', '|', '^']);
    L.push(`  { ${ty()} a = ${val()}; ${ty()} b = ${val()}; ${ty()} c = 0;`);
    L.push(`    ${op === '/' ? 'if (b != 0) ' : ''}c = a ${op} b;`);
    L.push(`    cout << a << " " << b << " " << c << " " << (a < b) << (a > b) << (a <= b) << (a >= b) << " " << (a == b) << (a != b) << " " << -a << " " << a.to_int() << " " << (a ${op === '/' ? '+' : op} b) << endl;`);
    L.push(`    printf("%.17g %.17g\\n", c.to_double(), (double)(b * a)); }`);
  }
  L.push('  return id(0);', '}');
  return L.join('\n');
}

test('#1643 ap_fixed: the types of the results, every quantization mode, saturation, conversions, comparisons, shifts, cout with its precision: as AMD\'s ap_fixed.h', { skip: AP.why || false }, () => {
  const sim = simulateC(FIXED, { file: 'fixed.cpp' });
  assert.deepEqual([sim.error, sim.diagnostics, sim.exitCode], [null, [], 0]);
  assert.equal(sim.output, runWithApInt(FIXED, AP.dir));
});

test('#1643 ap_fixed: random types, modes and operators (+ - * / & | ^, the six comparisons, -, to_int, to_double), as AMD\'s ap_fixed.h', { skip: AP.why || false }, () => {
  for (const seed of [11, 12, 13]) {
    const src = genFixed(seed, 50);
    const sim = simulateC(src, { file: 'r.cpp' });
    assert.deepEqual([sim.error, sim.diagnostics], [null, []], `seed ${seed}`);
    const ref = runWithApInt(src, AP.dir).split('\n'), got = sim.output.split('\n');
    ref.forEach((line, i) => assert.equal(got[i], line, `seed ${seed}, line ${i + 1}`));
  }
});

test('#1643 ap_fixed: what is not supported said', () => {
  assert.deepEqual(errs('#include "ap_fixed.h"\nap_fixed<8, 4> f(ap_fixed<8, 4> x) {\n  return x;\n}\n'), [
    "2 the result of 'f': ap_fixed is not synthesized yet (#1643): the C simulation runs it",
    "2 the parameter 'x': ap_fixed is not synthesized yet (#1643): the C simulation runs it",
  ]);
  const tb = (decl) => cToHdl(`#include "ap_fixed.h"\nint f(int x) { return x; }\nint main() {\n  ${decl}\n  return 0;\n}\n`, { file: 'e.cpp' }).diagnostics.map((d) => `${d.line} ${d.message}`);
  assert.deepEqual(tb('ap_fixed<8, 4, AP_ROUND> a = 1;'), ["4 ap_fixed: 'AP_ROUND' is not a quantization mode (AP_RND, AP_RND_ZERO, AP_RND_MIN_INF, AP_RND_INF, AP_RND_CONV, AP_TRN, AP_TRN_ZERO)"]);
  assert.deepEqual(tb('ap_fixed<8, 4, AP_TRN, AP_WRAP, 2> a = 1;'), ['4 ap_fixed: saturation bits (N) are not supported yet']);
  assert.deepEqual(tb('ap_fixed<8, 4, AP_TRN, AP_WRAP_SM> a = 1;'), ['4 ap_fixed: AP_WRAP_SM are not supported yet']);
  assert.equal(simulateC('#include "ap_fixed.h"\nint f(int x) { return x; }\nint main() { ap_fixed<8, 4> a = 1.5; int k = a % 2; return k; }\n', { file: 't.cpp' }).error?.message, "'%' of an ap_fixed");
});
