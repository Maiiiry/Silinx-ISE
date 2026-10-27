// popcount: the number of 1 bits of a 16-bit word. The loop has a constant count and is unrolled
// (#pragma HLS UNROLL): one adder tree, a combinational module.
// Silinx test design (#1746). Copyright 2026 Pedro Maló. AGPL-3.0-only.
#include "ap_int.h"
#include <stdio.h>

ap_uint<5> popcount(ap_uint<16> x) {
  ap_uint<5> n = 0;
  for (int i = 0; i < 16; i++) {
#pragma HLS UNROLL
    n += x[i];
  }
  return n;
}

// the test bench: 256 values, each compared with a count made another way (clearing the lowest 1 bit)
int main(void) {
  int errors = 0;
  for (unsigned v = 0; v < 65536; v += 257) {
    unsigned w = v, k = 0;
    while (w) { w &= w - 1; k++; }
    if ((unsigned)popcount(v) != k) { printf("popcount(%u) = %u, expected %u\n", v, (unsigned)popcount(v), k); errors++; }
  }
  printf("popcount(65535) = %u\n", (unsigned)popcount(65535));
  printf(errors ? "FAIL: %d wrong result(s)\n" : "PASS\n", errors);
  return errors;
}
