In detail:

- **core/logic.js split: the gate schematic of a truth table in core/logic-sch.js (#405):** a truth table's
  outputs as trees of gates placed and wired as a schematic move to a module of their own; logic.js still exports
  them (logic.js 1245 → 940 lines). No change in behaviour: the repository's truth tables and 120 random ones, in
  every form and both languages (2420 results), give the same schematics and errors as before. Tests:
  `test/logic-sch.test.js`.
