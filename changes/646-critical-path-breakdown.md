In detail:

- **The quality comparison against ISE: each critical path's logic and routing (#646):** for ISE's flow and for
  Silinx's routing at both Optimization Efforts, `test/designs-corpus/compare-ise.mjs` records, from trce's report
  (the same analyser on both sides), the critical path's levels of logic, its LUT, carry, flip-flop and other
  logic delays and its routing delay (`path` in `ise-comparison.json`); docs/QUALITY.md shows them in a table of
  their own, with what the designs slower than ISE lose in logic and in routing, to tell a synthesis's loss from
  a place and route's. Tests: `test/quality-page.test.js`, on extracts of ISE 14.7's trce reports
  (`test/fixtures/trce`).
