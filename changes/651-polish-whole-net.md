In detail:

- **The router's polish of the critical path: a connection's whole net routed again, and a lookahead (#651):**
  two more moves after #662's, each kept only when Silinx's timing analysis says the critical path is shorter,
  so never slower by it. The whole net of a connection of the critical path routed again on the wires no other
  net uses, its branch loads weighted by the most critical load below a node instead of the sum of their
  criticalities: a reset or a clock enable whose loads are all critical had a chain of shared doubles
  (vtr-ch-intrinsics' reset, 1.41 ns where 0.51 was free), which no change of one load at a time shortens,
  each new branch slowing the others. And, when no change gains, a lookahead: one of the path's three slowest
  connections made faster though another path gets longer, then up to 16 changes from there, all of it kept
  when the critical path ends shorter. The polish's searches count the branch loads of the net's tree, as the
  router's do. By the analysis, on 31 designs (the issue's, the examples and more; seeds 1-3 of the same
  placements, without replication): −0.33 % on the XC3S250E (epfl-bar −2.8 %, epfl-max −1.8 %, verilog-uart
  −1.1 %), −0.49 % on 16 of them on the XC3S1200E (epfl-bar −2.7 %, iwls05-i2c −1.7 %), none slower, the
  routing 3–4 % longer; in the app's flow (with register replication, seeds 1-2) −0.27 % and −0.29 %, the place
  and route as long as before. Checked with ISE: by trce −1.12 % on the examples and six corpus designs (epfl-max
  −4.4 %, epfl-bar −2.9 %, iwls05-i2c −2.5 %, verilog-uart −2.2 %, none slower), every `.bit` byte-identical to
  ISE's bitgen, DRC clean. `research/s3e-route/crit-path.mjs` no longer counts a carry chain's connection as
  −0.103 ns of the placement's floor (it inflated the router's share by 0.1 ns per carry stage).
