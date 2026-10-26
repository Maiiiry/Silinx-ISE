In short:

- **C files checked:** a `.c` file opens in the editor with C's highlighting; its checks (what Silinx C, compatible with
  Vitis HLS, can make into hardware) are marked as you type, and Check Syntax lists them with their help.

In detail:

- **Silinx C, the parser and its checks (#1524):** core/c-lex.js (the preprocessor: #include of the known headers,
  #define and macros, #if; the HLS pragmas), core/c-parse.js (the syntax tree), core/c-check.js (names, calls, types,
  `ap_int<W>` widths, the top function, the loops' trip counts, and UG1399's rules: no recursion, dynamic memory,
  system calls, pointer variables or arithmetic, floating point, structures, goto, unbounded loops, visible undefined
  behaviour), core/hints-c.js (their help in English and Portuguese); web/js/editor.js (C highlighting, the lint),
  web/js/processes.js (Check Syntax of a `.c` file). Tests: test/c-check.test.js, test/ui/c-check.test.js.
