In short:

- SSim's toolbar has the model to simulate (Behavioral, Post-Synthesis…) at its right end, after Edit Stimuli: another
  one chosen simulates the module with it, in its own tab.

In detail:

- **The model in SSim's toolbar (#1353):** web/js/tasks-sim.js (placeModel: the simulation's model shown; another one
  simulated, a netlist not generated yet offered first), web/js/tasks.js, web/css/tasks.css; the Tasks interface's
  only. Test: test/ui/tasks-sim.test.js.
