In detail:

- **core/isesch.js split: the library symbols' HDL in core/isesch-hdl.js (#405):** the exact HDL of the ISE
  library symbols with no Silinx twin (gates with inverted inputs, multiplexers, decoders, comparators, adders,
  counters, flip-flops, tri-states, multipliers) moves to a module of its own (isesch.js 1217 → 981 lines). No change
  in behaviour: the 168 library names' templates (1008, both languages) and the repository's ISE schematics, imported,
  are the same as before. Tests: `test/isesch-hdl.test.js`.
