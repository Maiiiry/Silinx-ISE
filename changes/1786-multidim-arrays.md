In short:

- **Silinx HLS: arrays of two or more dimensions** in hardware (one memory, row-major, as Vitis HLS) and as arguments in
  the C simulation; AMD's using_array_stencil_1d passes (45 of 73).

In detail:

- **Arrays of more dimensions (#1786):** core/c-flatten.js: an array of N x M x … elements (an argument, a local, a
  static, a global) is one array of N*M*… words in synthesis, `a[i][j]` at `i*M + j`, its nested initializer its
  words in order; a row of it alone (`a[i]` passed on) is said not supported yet. The C simulation gives an array
  argument of more dimensions its dimensions (they were lost: "an index of a value that is not an array").
