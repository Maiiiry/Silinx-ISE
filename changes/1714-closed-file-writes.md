In short:

- **Silinx HLS: AMD's DATAFLOW example simple_fifos passes** (C simulation, synthesis as processes, co-simulation;
  32 of 73).

In detail:

- **Closed files (#1714):** the C simulation drops the writes to a file after its close (an `ofstream` closed in a
  loop, as AMD's simple_fifos test bench does), as C++'s stream in its failed state; the test bench's golden file
  then compares as it does with the C++ compiler.
