In detail:

- **A test bench just added found as its module, not its file (#1285):** test/ui/harness.js (tasksTreeRow: a file by its
  whole name only, so a module's name waits for the module instead of selecting its file before the project is compiled
  again; and while waiting, with the Simulation view asked, Design and that view again), for stimuli.test.js's flaky
  simulate() on CI.
