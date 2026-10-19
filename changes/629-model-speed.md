In short:

- **Simulation models faster in the Board Emulator:** the Post-Synthesis model of pong runs about 6 times faster on
  the compiled engine (0.57 to 3.5 million cycles a second), stopwatch's 30 % faster, vga's and blinky's up to 10 %.
  A gate-level model stays below the board's 50 MHz; the status line says what share of real time it runs at.

In detail:

- **The compiled engine on gate-level models (#629):** measured on the examples' Post-Synthesis models (Node, Apple
  silicon, millions of cycles a second, Verilog / VHDL): pong 0.57 / 0.56 to 3.48 / 3.53, stopwatch 39.1 / 38.0 to
  50.4 / 47.5, vga 12.4 / 11.5 to 13.6 / 13.0, blinky 26.9 / 31.1 to 28.9 / 30.8; the behavioural designs unchanged,
  every output the same after a million cycles. Three changes in `core/compiled-sim.js`:
  - a run() above V8's limit of the bytecode it optimizes (60 KB, about 0.66 byte a character of code: pong's model
    106 000 characters, 71 KB) stayed in the interpreter. The code of more than SPLIT (80 000) characters is now
    generated again split: the values are the code's own, not copied into run() and back, and the combinational cells
    are functions of CHUNK (40 000) characters at most inside run() (`chunks`). Below it, as before: split, the smaller
    models ran at half their speed;
  - a constant shifted by an unsigned amount of 5 bits at most (a LUT's INIT read at its inputs) is a shift, without
    the helper `H.shN`: pong 1.6 to 3.1 split, stopwatch 39 to 53, vga 12.3 to 10.3;
  - a gate-level model (`gateLevel`: LUTs or SIMPRIM's X_LUTs) has its constants folded after the flatten (`opt_expr
    -full` in `prepCommands`): vga 10.3 to 13.6, blinky 26 to 29; a behavioural design is slower with it (blinky 118 to
    94), so it is left as it was.
  Tests: `test/compiled-sim.test.js` (`chunks`; split and in one piece the same values, every net, cycle by cycle, on
  pong and the synthesized netlist's primitives; the LUTs without the helper; pong's model split by itself and its
  outputs as in one piece; it fails on the old engine).
