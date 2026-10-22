In detail:

- **core/elaborate.js split: the instances and the statements (#405):** a module's instance elaborated
  (elab-instance.js) and the sequential statements bound (elab-stmt.js) move to modules of their own; elaborate.js
  still exports what it did (elaborate.js 1689 → 897 lines). No change in behaviour: every HDL folder of the
  repository elaborates the same, and the designs that simulate standalone give the same values and messages.
  Tests: `test/elab-parts.test.js`.
