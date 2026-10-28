// The C editor's Language Templates (#1855, web/js/c-templates.js): each, in a source of its own (in a top function
// where it is a statement, a test bench calling it), synthesized by Silinx HLS with no warnings and run by the C
// simulation; the C++ ones in a .cpp source only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C_SNIPPETS, cSnippets } from '../web/js/c-templates.js';
import { cToHdl } from '../core/c-hdl.js';
import { simulateC } from '../core/c-interp.js';

const snip = (name) => C_SNIPPETS.find((s) => s.name === name).text.replace(/\$\{name\}/g, 'top').replace('$0', '');
const H = '#include "ap_int.h"\n#include <stdio.h>\n';
const HPP = '#include "ap_int.h"\n#include "hls_stream.h"\n#include "hls_task.h"\n#include <stdio.h>\n';
const MAIN = (body) => `int main(void) {\n  ${body}\n  return 0;\n}\n`;
// each template's source: the template where it goes, a test bench; the file's name
const SOURCES = {
  includes: () => [`${snip('includes')}int top(int a) { return a + 1; }\n${MAIN('printf("%d\\n", top(1));')}`, 't.c'],
  'top function (ports)': () => [`${H}${snip('top function (ports)')}${MAIN('ap_uint<9> s; top(200, 100, &s); printf("%d\\n", (int)s);')}`, 't.c'],
  'test bench (main)': () => [`${H}int top(int a) { return a * 2; }\n${snip('test bench (main)').replace('  \n', '  if (top(3) != 6) errors++;\n')}`, 't.c'],
  'ap_uint / ap_int': () => [`${H}int top(int a) {\n${snip('ap_uint / ap_int')}\nreturn (int)u + (int)v + a;\n}\n${MAIN('printf("%d\\n", top(1));')}`, 't.c'],
  'bits and ranges': () => [`${H}ap_uint<8> top(ap_uint<8> x) {\n${snip('bits and ranges')}\nreturn x + hi + b3;\n}\n${MAIN('printf("%d\\n", (int)top(0xa6));')}`, 't.c'],
  ap_fixed: () => [`${H}#include "ap_fixed.h"\nap_fixed<16, 8> top(ap_fixed<16, 8> a) {\n${snip('ap_fixed')}\nreturn a * k;\n}\n${MAIN('printf("%f\\n", (double)top(2.5));')}`, 't.cpp'],
  'for loop (PIPELINE)': () => [`${H}int top(int x) {\n  int s = 0;\n${snip('for loop (PIPELINE)').replace('  \n', '  s += x * i;\n')}\n  return s;\n}\n${MAIN('printf("%d\\n", top(1));')}`, 't.c'],
  'for loop (UNROLL)': () => [`${H}int top(int x) {\n  int s = 0;\n${snip('for loop (UNROLL)').replace('  \n', '  s += x << i;\n')}\n  return s;\n}\n${MAIN('printf("%d\\n", top(3));')}`, 't.c'],
  'loop of a variable count (LOOP_TRIPCOUNT)': () => [`${H}int top(int n) {\n  int s = 0;\n${snip('loop of a variable count (LOOP_TRIPCOUNT)').replace('  \n', '  s += i;\n')}\n  return s;\n}\n${MAIN('printf("%d\\n", top(10));')}`, 't.c'],
  'array argument (ap_memory)': () => [`${H}${snip('array argument (ap_memory)')}${MAIN('int a[8] = {1, 2, 3, 4, 5, 6, 7, 8}; printf("%d\\n", sum8(a));')}`, 't.c'],
  'ROM (a constant table)': () => [`${H}${snip('ROM (a constant table)')}ap_uint<8> top(ap_uint<3> i) { return ROM[i]; }\n${MAIN('printf("%d\\n", (int)top(5));')}`, 't.c'],
  'static register (counter)': () => [`${H}${snip('static register (counter)')}${MAIN('counter(1); counter(0); printf("%d\\n", (int)counter(1));')}`, 't.c'],
  'struct argument': () => [`${H}${snip('struct argument')}ap_uint<9> top(pair_t p) { return p.re + p.im; }\n${MAIN('pair_t p = {200, 100}; printf("%d\\n", (int)top(p));')}`, 't.c'],
  'hls::stream (read, write)': () => [`${HPP}${snip('hls::stream (read, write)')}int main() {\n  hls::stream<int> i, o;\n  i.write(41);\n  top(i, o);\n  printf("%d\\n", o.read());\n  return 0;\n}\n`, 't.cpp'],
  'DATAFLOW (two processes, a stream)': () => [`${HPP}${snip('DATAFLOW (two processes, a stream)')}int main() {\n  int a[8] = {1, 2, 3, 4, 5, 6, 7, 8}, b[8];\n  top(a, b);\n  printf("%d %d\\n", b[0], b[7]);\n  return 0;\n}\n`, 't.cpp'],
  'hls::task (data-driven)': () => [`${HPP}${snip('hls::task (data-driven)')}int main() {\n  hls::stream<int> i, o;\n  for (int k = 0; k < 4; k++) i.write(k);\n  top(i, o);\n  for (int k = 0; k < 4; k++) printf("%d ", o.read());\n  printf("\\n");\n  return 0;\n}\n`, 't.cpp'],
};
const OUT = {
  includes: '2\n', 'top function (ports)': '300\n', 'test bench (main)': '0 error(s)\n', 'ap_uint / ap_int': '196\n',
  'bits and ranges': '176\n', ap_fixed: '1.875000\n', 'for loop (PIPELINE)': '28\n', 'for loop (UNROLL)': '45\n',
  'loop of a variable count (LOOP_TRIPCOUNT)': '45\n', 'array argument (ap_memory)': '36\n', 'ROM (a constant table)': '32\n',
  'static register (counter)': '2\n', 'struct argument': '300\n', 'hls::stream (read, write)': '42\n',
  'DATAFLOW (two processes, a stream)': '3 17\n', 'hls::task (data-driven)': '2 3 4 5 \n',
};

test('#1855 every C template synthesized by Silinx HLS with no warnings, and its C simulation as C computes it', () => {
  assert.deepEqual(Object.keys(SOURCES), C_SNIPPETS.map((s) => s.name));
  const bad = [];
  for (const [name, make] of Object.entries(SOURCES)) {
    const [src, file] = make();
    const r = cToHdl(src, { file });
    if (!r.ok || r.diagnostics.length) bad.push(`${name}: ${r.diagnostics.map((d) => `${d.line} ${d.severity} ${d.message}`).join('; ')}`);
    const sim = simulateC(src, { file });
    if (sim.error || sim.output !== OUT[name]) bad.push(`${name}: C simulation ${sim.error?.message ?? JSON.stringify(sim.output)}`);
  }
  assert.deepEqual(bad, []);
});

test('#1855 the templates of a .c source are C\'s; a .cpp source\'s add hls::stream, DATAFLOW and hls::task', () => {
  const cpp = ['hls::stream (read, write)', 'DATAFLOW (two processes, a stream)', 'hls::task (data-driven)'];
  assert.deepEqual(cSnippets('src/f.c').map((s) => s.name), C_SNIPPETS.map((s) => s.name).filter((n) => !cpp.includes(n)));
  assert.deepEqual(cSnippets('src/f.cpp').map((s) => s.name), C_SNIPPETS.map((s) => s.name));
  // each with its cursor ($0) once
  for (const s of C_SNIPPETS) assert.equal(s.text.split('$0').length, 2, s.name);
});
