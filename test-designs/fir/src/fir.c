// fir: a 4-tap FIR filter, y = c0*x[n] + c1*x[n-1] + c2*x[n-2] + c3*x[n-3]: its delay line a static array
// (registers that keep their values from call to call), shifted at each sample.
// Silinx test design (#1746). Copyright 2026 Pedro Maló. AGPL-3.0-only.
#include <stdio.h>

#define TAPS 4
static const int C[TAPS] = {1, 3, 3, 1};

int fir(int x) {
  static int d[TAPS];
  int y = 0;
  for (int i = TAPS - 1; i > 0; i--) {
#pragma HLS UNROLL
    d[i] = d[i - 1];
  }
  d[0] = x;
  for (int i = 0; i < TAPS; i++) {
#pragma HLS UNROLL
    y += C[i] * d[i];
  }
  return y;
}

// the test bench: an impulse gives the coefficients back, a step their running sum
int main(void) {
  int in[12] = {1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1};
  int expect[12] = {1, 3, 3, 1, 0, 0, 1, 4, 7, 8, 8, 8};
  int errors = 0;
  for (int n = 0; n < 12; n++) {
    int y = fir(in[n]);
    printf("x[%d] = %d  y[%d] = %d\n", n, in[n], n, y);
    if (y != expect[n]) errors++;
  }
  printf(errors ? "FAIL: %d wrong sample(s)\n" : "PASS\n", errors);
  return errors;
}
