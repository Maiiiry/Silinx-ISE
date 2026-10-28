In detail:

- **A declaration after a definition (#1823):** in C++, a function declared again after its definition (a header that two
  sources include) no longer takes the definition's place, so its reference parameters to streams are streams; the
  co-simulation's test bench makes a stream the design polls (`s.empty()`, `s.full()`) empty or full only when it is.
  AMD's auto_disaggregation_of_struct passes (47 of 73).
