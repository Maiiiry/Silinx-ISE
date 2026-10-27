In short:

- **Silinx C++ (a first part):** a .cpp source is a module as a .c one is (its Design row `[C++]`): namespaces and
  using, qualified names, constexpr, nullptr, static_cast, static_assert, reference parameters (a pointer's ports, as
  Vitis HLS makes them), std::cout and the file streams (ofstream / ifstream) of its test bench.

In detail:

- **C++, a first part (#1590):** core/cpp-lex.js (C++ as tokens: a namespace's braces and using dropped, qualified names
  their last part, constexpr, nullptr, static_cast / const_cast, static_assert, using aliases, the C++ headers C's,
  file streams FILE *s), core/cpp-tree.js (reference parameters: their uses *x and their arguments &a; cout / cerr
  printf; a file stream's <<, >>, open, close, eof fprintf, fscanf, fopen, fclose, feof); a .cpp file read as C++
  (core/c-lex.js, c-parse.js), a source of the app (core/view-hdl.js, web/js/c-source.js, design.js, app.js,
  processes.js). The HLS corpus runs the C++ examples: ten of AMD's examples now pass every stage, an exception a
  design's failure. Tests: test/cpp.test.js (against the host's C++ compiler, co-simulated in VHDL and Verilog).
- **true and false of stdbool.h (#1602)** are defined (they were not declared). Tests: test/cpp.test.js.
- **A pointer written then read** in the same function crashed the C synthesis (#1603): its value is the one written.
  Tests: test/cpp.test.js.
- **A call of a function declared but not defined** crashed the C synthesis (#1605): said. Tests: test/hls-corpus run.
