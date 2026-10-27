// gcd: the greatest common divisor of two numbers (Euclid's algorithm by subtraction), made into hardware by
// Silinx HLS. The loop's count depends on the data: a state machine that takes as many cycles as it needs
// (C/RTL Co-simulation shows its latency, call by call).
// Silinx test design (#1746). Copyright 2026 Pedro Maló. AGPL-3.0-only.
#include <stdio.h>

unsigned gcd(unsigned a, unsigned b) {
  while (b != 0) {
#pragma HLS LOOP_TRIPCOUNT max=64
    if (a >= b) a = a - b;
    else { unsigned t = a; a = b; b = t; }
  }
  return a;
}

// the test bench: main() is never made into hardware; it returns 0 when every result is the expected one
int main(void) {
  unsigned t[6][3] = {{48, 18, 6}, {17, 5, 1}, {100, 75, 25}, {7, 0, 7}, {0, 9, 9}, {81, 27, 27}};
  int errors = 0;
  for (int k = 0; k < 6; k++) {
    unsigned g = gcd(t[k][0], t[k][1]);
    printf("gcd(%u, %u) = %u\n", t[k][0], t[k][1], g);
    if (g != t[k][2]) errors++;
  }
  printf(errors ? "FAIL: %d wrong result(s)\n" : "PASS\n", errors);
  return errors;
}
