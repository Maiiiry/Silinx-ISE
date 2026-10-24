In detail:

- **Spartan-6: the router (#730):** the placed Spartan-6 design routed on the device description's routing graph
  (`core/fpga/s6/route.js`): PathFinder's negotiated congestion as the Spartan-3E router, the global clocks on
  the global network only (the spines, BUFH, the HCLK rows, the switch boxes' GCLK wires), a pad into its global
  buffer by the dedicated clock path, the power nets from the TIEOFFs near their sinks (one net a TIEOFF, as ISE),
  route-throughs only through the unused I/O logic and BUFH (their XDL_DUMMY instances) or out of a net's own
  slice, optionally the known switches only (`allowPip`, for the bit database, #726). The routed design as XDL
  (`route-output.js`) and its rules checked against the graph (`route-check.js`: every switch the device's, every
  sink reached, no node of two nets, the clocks off the general interconnect, every route-through declared).
  Every example routes completely on the XC6SLX16 and the XC6SLX45 in a few passes and under 3 seconds, with
  1.0 to 1.2 times the switches per connection of ISE's routing of the same netlists (night 1,
  `research/s6/compare-route.mjs`); ISE reads every routing and its DRC finds no error and no warning but
  stopwatch's 9K block RAM note, which ISE's own implementation has too (`research/s6/measured/ise-check.json`).
