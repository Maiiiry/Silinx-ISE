// stream_sum: a stream of 8 samples in (hls::stream, a FIFO port), their running sums out on another stream.
// C++: references and hls::stream, as Vitis HLS takes them.
// Silinx test design (#1746). Copyright 2026 Pedro Maló. AGPL-3.0-only.
#include "ap_int.h"
#include "hls_stream.h"
#include <iostream>

void stream_sum(hls::stream<ap_uint<8> > &samples, hls::stream<ap_uint<12> > &sums) {
  ap_uint<12> acc = 0;
  for (int i = 0; i < 8; i++) {
    acc += samples.read();
    sums.write(acc);
  }
}

// the test bench: 8 samples written, the 8 sums read back and compared
int main() {
  hls::stream<ap_uint<8> > in;
  hls::stream<ap_uint<12> > out;
  int x[8] = {10, 20, 30, 255, 0, 1, 2, 3};
  for (int i = 0; i < 8; i++) in.write(x[i]);
  stream_sum(in, out);
  int errors = 0, s = 0;
  for (int i = 0; i < 8; i++) {
    s += x[i];
    int y = out.read();
    std::cout << "sum[" << i << "] = " << y << std::endl;
    if (y != s) errors++;
  }
  std::cout << (errors ? "FAIL" : "PASS") << std::endl;
  return errors;
}
