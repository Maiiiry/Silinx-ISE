In short:

- **Silinx toolchain, synthesis at effort High:** a memory written at one address and read asynchronously at several
  (a processor's register file) becomes distributed RAM when that makes the design smaller and no slower: the T80
  (Z80) takes about as many slices as with XST (1009 instead of 1146; XST 1000), 233 flip-flops instead of 361, and is
  6 % faster by ISE's timing analysis.

In detail:

- **The memories as distributed RAM (#54):** Yosys's memory step prices a memory left to logic at a flip-flop per bit
  and leaves out its read multiplexers, so the T80's register file (two arrays of 8 × 8 bits, three read ports) was
  128 flip-flops. With High's mappings, the usual run now counts the memories written to that it left to logic
  (without changing the netlist), and a design with some is synthesized once more with them priced at `LUTRAM_COST`
  (RAM16X1D), High's mappings made from that netlist; of those, the one with the fewest slices that is kept by
  `DEPTH_RULE` and no slower than the netlist chosen by the estimate is kept. On the examples and the design corpus at
  High every netlist is the same but two: the T80 1146 → 1009 slices, 2153 → 1816 LUTs (and 32 RAM16X1D), trce
  21.67 → 20.36 ns (seeds 1 to 3); IWLS'05 simple_spi 89 → 79 slices, 6.16 → 6.07 ns routed. The usual mapping with
  the RAM alone is slower (the read address deeper: the T80 7 % slower by trce), so it is never taken on its own; the
  T80's synthesis at High takes 42 → 80 s. `synthesizeOpen`'s `depth.lutram` says what happened.
