In short:

- The modern interface's Implement no longer lists the Generate Post-… Simulation Model processes (Simulate generates
  the model it needs), and Edit Constraints (Text) opens the constraints in Implement, not in Design.

In detail:

- **Implement's processes (#1265):** web/js/processes.js (the four Generate Post-… Simulation Model processes in the
  classic interface's Processes only), web/js/tasks.js (taskOfDoc: the constraints file Implement's document, as I/O
  Pin Planning). Tests: test/ui/tasks.test.js, test/ui/tasks-emu-procs.test.js, test/ui/open-toolchain.test.js and test/ui/standalone.test.js (the
  simulation models' tests in the classic interface), test/tasks.test.js.
