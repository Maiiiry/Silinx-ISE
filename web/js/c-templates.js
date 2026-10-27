// The templates of a new C or C++ source (New Source ▸ C Function (HLS), C++ Function (HLS); Silinx HLS, docs/c-to-hdl.md):
// its top function, its ports explained, a test bench. No DOM: the unit tests read them too.

/** A new C source (Silinx HLS, docs/c-to-hdl.md): its top function, its ports explained, a test bench (#1531). */
export function cTemplate(name) {
  return [
    `// ${name}: a C function made into hardware by Silinx HLS (compatible with AMD's Vitis HLS).`,
    '// The top function becomes a module: an argument passed by value is an input port, a pointer argument',
    '// written is an output port (with its _ap_vld), the returned value is ap_return; ap_start, ap_done,',
    '// ap_idle and ap_ready start a call and say when it is done. See docs/c-to-hdl.md.',
    '#include "ap_int.h"',
    '#include <stdio.h>',
    '',
    `void ${name}(ap_uint<4> a, ap_uint<4> b, ap_uint<5> *sum, bool *carry) {`,
    '  ap_uint<5> s = a + b;',
    '  *sum = s;',
    '  *carry = s[4];',
    '}',
    '',
    '// the test bench: main() is never made into hardware',
    'int main(void) {',
    '  ap_uint<5> sum;',
    '  bool carry;',
    `  ${name}(9, 8, &sum, &carry);`,
    '  printf("9 + 8 = %d (carry %d)\\n", (int)sum, (int)carry);',
    '  return 0;',
    '}',
    '',
  ].join('\n');
}

/** A new C++ source (#1590): its top function (references its outputs, a template), a test bench with std::cout. */
export function cppTemplate(name) {
  return [
    `// ${name}: a C++ function made into hardware by Silinx HLS (compatible with AMD's Vitis HLS).`,
    '// The top function becomes a module: an argument passed by value is an input port, a reference written',
    '// is an output port (with its _ap_vld), the returned value is ap_return; ap_start, ap_done, ap_idle and',
    '// ap_ready start a call and say when it is done. See docs/c-to-hdl.md.',
    '#include "ap_int.h"',
    '#include <iostream>',
    '',
    '// a template: one adder per width it is used with',
    'template <int W> ap_uint<W + 1> add(ap_uint<W> a, ap_uint<W> b) { return a + b; }',
    '',
    `void ${name}(ap_uint<4> a, ap_uint<4> b, ap_uint<5> &sum, bool &carry) {`,
    '  ap_uint<5> s = add<4>(a, b);',
    '  sum = s;',
    '  carry = s[4];',
    '}',
    '',
    '// the test bench: main() is never made into hardware',
    'int main() {',
    '  ap_uint<5> sum;',
    '  bool carry;',
    `  ${name}(9, 8, sum, carry);`,
    '  std::cout << "9 + 8 = " << sum << " (carry " << carry << ")" << std::endl;',
    '  return 0;',
    '}',
    '',
  ].join('\n');
}
