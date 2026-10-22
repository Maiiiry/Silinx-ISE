In detail:

- **core/schdoc.js split: the symbol library in core/schdoc-symbols.js (#405):** the symbols, their parameters and
  local geometry and the I/O markers' geometry move to a module of their own; schdoc.js still exports every name it
  did, and is now under the 1000-line limit (1276 → 777). No change in behaviour: every symbol type and preset
  (608 sheets, both languages) and every schematic and HDL folder of the repository (289 results) give the same
  documents and HDL as before. Tests: `test/schdoc-symbols.test.js`.
