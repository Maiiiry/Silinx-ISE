In detail:

- The open synthesis's code split (#405): running Yosys (`core/synth-open-yosys.js`), the critical path of a
  netlist (`core/synth-open-path.js`) and the depth-oriented mappings (`core/synth-open-depth.js`), out of
  `core/synth-open.js` (1387 → 848 lines; `synthesizeOpen` 478 → 198); no change in behaviour.
