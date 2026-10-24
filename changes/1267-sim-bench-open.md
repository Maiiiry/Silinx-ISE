In short:

- Simulate's Simulation tree: a test bench clicked shows its instances expanded, the other benches collapsed (▸).

In detail:

- **A test bench clicked, expanded (#1267):** web/js/isim-tree.js (openBench: the simulated bench expanded when its
  simulation comes to the front; its row clicked expands it; the other benches' rows a collapsed twisty), web/js/isim.js,
  web/js/viewers.js (on activation). Test: test/ui/tasks-sim.test.js.
