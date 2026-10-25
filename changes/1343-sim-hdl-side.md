In short:

- Simulate: a test bench's HDL opened from the Simulation tree opens beside the tree, no longer over it.

In detail:

- **The Simulation tree beside a source (#1343):** web/js/tasks-sim.js (placeSimSide: the last simulation's side panel
  kept at the left of a source in front in Simulate; fitSimTabs measures it), web/js/tasks.js, web/css/tasks.css. Test:
  test/ui/tasks-sim.test.js.
