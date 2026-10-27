In detail:

- **ap_int division (#1588):** a division of ap_int / ap_uint values divides them as they are and wraps the quotient to
  its W1 + S2 bits, as AMD's ap_int.h, in the C simulation and in the generated HDL (both operands were first made the
  result's width, so a wider divisor wrapped: `ap_int<4>` -8 divided by `ap_uint<4>` 8 gave 1, not -1). The C
  simulation's ap_int / ap_uint arithmetic is now tested against AMD's open ap_int.h compiled as C++: every operator,
  widths from 1 to 32 bits, signed and unsigned, their edge values (test/ap-int-ref.js: the headers at a fixed commit,
  checked by their git hashes, fetched into the temporary folder at test time; skipped with no C++ compiler or network).
