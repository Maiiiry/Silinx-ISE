In short:

- **Silinx HLS: the test benches' `std::vector`, `std::generate` / `std::fill` and `<random>`** run in the C
  simulation; three more of AMD's examples pass (36 of 73).

In detail:

- **A test bench's C++ library (#1734):** core/cpp-stl.js: `std::vector<T> v(n)` / `v(n, x)` an array of its size
  (`v[i]`, `v.data()`, `v.size()`; a `vector<T> &` parameter an array), `std::generate` / `std::fill` over a vector a
  loop, `<random>`'s `default_random_engine` and `uniform_int_distribution<T>` as libstdc++ makes them (Vitis HLS's Linux
  C simulation: minstd_rand0, the scaled draws); an array whose size is known when it runs, outside the synthesized
  code (which keeps fixed sizes); `<vector>`, `<algorithm>`, `<random>` bring stdlib.h's macros (EXIT_FAILURE). The
  co-simulation reads only its test bench's lines (the simulator's own, its waveform limit, left out).
