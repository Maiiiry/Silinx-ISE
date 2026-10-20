In short:

- **Board Emulator: designs run up to twice as fast at Max speed:** the compiled engine skips more of the logic
  whose inputs did not change. The examples' designs run at 60 to 210 million cycles a second, pong's at 75
  instead of 39 and clock's at 115 instead of 71. pong's post-synthesis model runs at 30 instead of 22.

In detail:

- **The compiled engine's activity by the bits of a value read (#715, found with #670):** a cell reading part of a
  value is evaluated only when those bits change. Logic reading a counter's high bits no longer runs at every
  cycle. Every combinational cell of up to 32 bits may now track its changes for the cells that read it; the
  profile keeps this only for a cell whose value changes less than a quarter as often as what it reads, since the
  test costs more than it saves otherwise. The choice of the guarded segments weighs each cell by its operations (a
  table read with a ten-bit address against a NOT), and puts the cells evaluated at most cycles together. A cell
  read only inside its own segment sets no flag. The results are the same, cycle for cycle. In millions of cycles a
  second, Node / Chrome, against the previous version: the behavioural designs traffic 151 / 133 (from 73 / 78),
  blinky 210 / 180 (131 / 185), pong 76 / 74 (39 / 45), stopwatch 103 / 104 (70 / 77), clock 118 / 115 (71 / 75),
  vga 63 / 63 (64 / 64); the post-synthesis models pong 30 / 31 (22 / 22), stopwatch 77 / 67 (59 / 60), traffic,
  blinky, clock and vga as before. pong's and clock's models stay below the board's 50 MHz (#670): their test
  bench's generics make most of their logic change every cycle or two. With the same generics, the behavioural
  designs run at 52 (pong) and 68 (clock). A compiled model's `stats.work` gives the estimated work of a cycle.
