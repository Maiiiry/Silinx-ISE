In short:

- **Open synthesis:** a large round-robin arbiter written as gates takes about a quarter fewer LUTs and slices at High.

In detail:

- **The fourth balanced candidate: mfs2 on windows of 5000 nodes (#370):** the mapping balanced once more onto LUT4s alone
  (now `DEPTH_ABC2_LUT4`) ends with ABC's don't-care optimization on windows of up to 5000 nodes (`mfs2 -M 5000`, its
  own limit 300), which reach the terms a round-robin arbiter's balanced chains share: the EPFL arbiter in the corpus's
  I/O wrapper 2019 → 1537 LUTs and 1010 → 769 slices at High, as deep, routed 0.9 % faster by ISE's trce (seeds 1–3).
  The examples and the design corpus keep their netlists and warnings (the candidate is never kept there). The other
  candidates keep mfs2's own windows: on the wider functions with the LUT delays a wider window is slower, and the GIA's
  SOP balancing with it routed the arbiter 4 % slower at Normal.
