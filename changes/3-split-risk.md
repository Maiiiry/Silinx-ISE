In detail:

- **The measured XC3S250E description: no split node a short can come from (#3):** `prototype.mjs compare` counts the
  split nodes with two pieces a net can reach (188, all long lines at the chip's edges, now none) and those that cost a
  route (6377, now 478); `varyjoins.mjs long`, `edge` and `taps`, and `predict` / `edgejoins.mjs` on the measured graph's
  wires (`WIRES=`), closed them, every verdict agreeing with the shipped graph. The 43 designs pass ISE on it, 0.4% faster
  than on the shipped graph (research/s3e-device README section 14).
