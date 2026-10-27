In detail:

- **Silinx C: a source of several files (#1597):** `#include "name.h"` reads the project's own headers in place (core/c-lex.js:
  their macros the source's, include guards and `#pragma once` as C's); the top function can be named (`top`) where
  no pragma names it; a unit including the top function's file and the test bench's is simulated and co-simulated
  as one file (core/c-check.js, c-hdl.js, c-interp.js, c-cosim.js, c-asm.js). Tests: test/c-check.test.js,
  test/c-cosim.test.js.
