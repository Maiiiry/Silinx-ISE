In short:

- **Silinx HLS: a loop whose count depends on the inputs is made**, as Vitis HLS makes it (its latency unknown, a
  warning), instead of refused.

In detail:

- **Loops of unknown count (#1699):** a loop whose count is not known (`for (x = 0; x < width; x++)`, a `while`
  on a value) is a state machine running until its condition is false, as Vitis HLS makes it: a warning says its
  latency is unknown, the report's cycles unknown; `#pragma HLS LOOP_TRIPCOUNT max=` gives the report a bound. Its
  hint says so. One more of AMD's examples through co-simulation (31 of 73).
- **A header's constants (#1700):** a constant of a header that two sources include (`const int N = 10;`, no include
  guard) declared again with the same value is accepted, as C++'s file-scope constants are each source's own.
