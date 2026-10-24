In short:

- Simulate's side panel starts at the top of the work area, as Design's and Implement's, and the simulations' tabs are
  to its right, above the waves.

In detail:

- **Simulate's side panel from the top (#1259):** web/css/tasks.css (Simulate's tabs placed to the right of the side
  panel, the waves below them), web/js/tasks-sim.js (fitSimTabs: the side panel's width and the tabs' height, measured
  again when the panel is shown, folded or resized), web/js/tasks.js. Test: test/ui/tasks-sim.test.js.
