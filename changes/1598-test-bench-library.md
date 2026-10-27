In short:

- **Silinx C: the test bench's C library:** a C simulation's test bench may write its results to a file and compare
  them with a golden one (fopen, fprintf, fscanf, fgets, system("diff …")), as AMD's Vitis HLS examples do; stdlib.h,
  string.h, math.h, limits.h accepted.

In detail:

- **The test bench's C library (#1598):** core/c-interp-lib.js: printf and its kin, FILE and stdio's files in memory
  (the design's data files readable, those written kept and returned), fscanf's and fgets', system("diff [--brief]
  [-w | -b | -B] a b") compared as diff does, exit, abs; the standard headers' macros (EOF, NULL, EXIT_SUCCESS, INT_MAX…)
  (core/c-lex.js), FILE and size_t (core/c-parse.js), stdout / stderr and these functions in the test bench only
  (core/c-check.js). The HLS corpus passes the examples' data files: three of AMD's examples now pass every stage.
  Tests: test/c-interp.test.js (against cc's run with real files), test/c-check.test.js.
