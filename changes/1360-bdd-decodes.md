In short:

- The open synthesis maps a processor's wide instruction decode on fewer levels of logic: the T80 (Z80) is about 12 %
  faster once routed.

In detail:

- **The critical path's wide decodes collapsed and mapped again (#1360):** a cone of LUTs that computes a function of
  many flip-flops (the T80's instruction decode, T80_MCode's case of IR, ISet and MCycle) kept the shape the HDL wrote
  it in: 7 LUT levels for IncDec_16, a function of 19 flip-flops, where XST's takes 5. A new last candidate of the open
  synthesis (core/synth-open-bdd.js), on the netlist chosen of all the others (the memories' choice, #54, included),
  follows the critical paths back (through carry chains and a distributed RAM's address too) to the first signal with
  a cone of at most 22 leaves, collapses it to a BDD of them under 8 orders of its variables, has Yosys and ABC map each
  alone, and puts the shallowest mapping in the cone's place when it has fewer levels, checked against the old cone on
  every row up to 2^12, else on 512 random ones. Rounds while the estimate gets no longer, the LUTs within 8 % (+16);
  kept by DEPTH_RULE; `bdd: false` leaves it out. On the design corpus it is kept on the T80 at both efforts
  (estimate 20.41 → 17.37 ns at Normal, 1816 → 1976 LUTs; routed −12.4 % over seeds 1–6, all faster), itc99-b15 at
  High and epfl-sin; nothing else changes. `pathEnds` (core/synth-open-path.js) also gives the estimated arrival at a
  signal. Tests: test/synth-open-bdd.test.js.
