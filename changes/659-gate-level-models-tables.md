In short:

- **Board Emulator: the simulation models run 2 to 4 times faster again:** a post-synthesis, post-translate,
  post-map or post-place & route model of vga, clock, stopwatch, traffic or blinky runs at 35 to 200 million
  cycles a second in Chrome (the board's clock is 50 MHz): vga's at 67 instead of 18, clock's at 35 instead of 17.
  pong's runs at 20 instead of 15.

In detail:

- **A gate-level model's irregular logic as lookup tables (#659):** core/compiled-tables.js turns a model's
  one-bit logic into tables after core/compiled-words.js. This covers a counter's comparisons with constants, the
  decoders and the next state of a state machine. Each cone of gates, multiplexers and LUTs with 12 inputs at most
  is a ROM of its outputs at every value of those inputs: one read for tens of cells, several outputs in one word.
  When a netlist's tables would exceed 50 000 words, they get fewer inputs. A wide comparison of a counter with a
  constant becomes one equality. wordLevel then makes the flip-flops the tables feed into registers again, and each
  table's inputs follow their register's bits. Nets inside a table are no longer listed in the Watch box.
  Results are cycle for cycle the same: each example's models against bit by bit, and a synthesized design against
  the event-driven simulator. In millions of cycles a second (Node / Chrome), the post-synthesis models now run:
  traffic 165 / 203 (from 47 / 46), blinky 80 / 79 (39 / 44), stopwatch 50 / 49 (29 / 32), clock 35 / 35
  (16 / 17), vga 56 / 67 (18 / 18), pong 20 / 20 (15 / 16).
