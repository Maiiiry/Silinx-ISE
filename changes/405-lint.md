In detail:

- **core/lint.js split: designChecks' later rules in core/lint-design.js (#405):** the combinational loops, unused
  and unassigned signals, names differing only in case, clocks, Verilog's = / <= and integers without a range move
  to a mount of their own, called where they were (designChecks 468 → 257 lines). No change in behaviour: every
  design of the repository, every top, with each option set (366 runs), gives the same findings as before. Tests:
  `test/lint-design.test.js`.
