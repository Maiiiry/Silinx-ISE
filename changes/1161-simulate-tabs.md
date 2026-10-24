In short:

- **Simulate, several simulations at once:** each test bench (and model) its own tab; Simulate's side panel,
  Simulation and Instances, lists every test bench of the project, the one simulated opened as its instances, another
  one simulated in its own tab when clicked. Design has no Test page any more (the test benches are Simulate's).

In detail:

- **One simulation document per module and model (#1161):** ISim's document isim:<module>[@model] (web/js/viewers.js),
  Simulate no longer a single-document task (its tab bar), the command line the simulation in front's.
- **Simulation and Instances (#1161, #1159):** ISim's Instances and Processes under a tab in the Tasks layout, its tree
  the project's test benches (web/js/isim-tree.js); Edit's Test page removed (web/js/tasks-test.js), a new test bench
  made Simulate's.
