In short:

- **Board Emulator: the simulation models run faster, in Chrome as in Node:** a post-synthesis, post-translate,
  post-map or post-place & route model of an example runs up to 5 times faster than before (in Chrome blinky's 2.5
  times, near the board's 50 MHz; pong's and clock's 4 to 5 times), and Chrome no longer runs one for seconds at a
  tenth of its speed before it optimizes it.

In detail:

- **A gate-level model at word level again (#650):** core/compiled-words.js rewrites the netlist the compiled
  simulator reads from a synthesized or implemented netlist: a carry chain (MUXCY / XORCY, or their folded gates)
  is an addition, the flip-flops of its operands one register in its order, the multiplexers, gates and LUTs of
  the same kind side by side between them one word cell (a LUT a few bitwise operations, its pins in any order as
  the router leaves them); what is not such a word stays bits. Cycle for cycle the same values (the event-driven
  simulator on primitive netlists, every example's models against bit by bit). pong's and clock's models run at
  13 to 15 million cycles a second instead of 3 to 4, blinky's at 45 to 58 instead of 32.
- **The compiled code optimized by Chrome from the start (#650):** `CompiledSim.cycle` calls `run()` in pieces of
  10 000 cycles, the same values and counts: V8 optimizes a function called again and again with Turbofan, while a
  long-running `run()` stayed seconds in Maglev in Chrome (vga's model: 3 million cycles a second over its first 8
  million, now 10, as Node). A UI test runs vga's model in the browser and in Node: the same outputs, counts and VGA
  state, and in Chrome at least 0.6 of Node's speed.
