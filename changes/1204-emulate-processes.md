In short:

- **Emulate's Processes:** at the top of Emulate's side panel, under a Processes tab, the top module's User Constraints
  (I/O Pin Planning, Edit Constraints (Text), Check Constraints) and Emulate on Board with its models, as in Implement.

In detail:

- **Processes in Emulate (#1204):** web/js/processes.js (the User Constraints and Emulate on Board groups built once,
  for Implement and Emulate; `emulateProcesses()`; `renderProcessTree(host, defs)`, the panel's tree drawn anywhere,
  Emulate's redrawn with the panel: the same states); web/js/tasks-emu.js (placeProcesses: the tab and the tree at the
  top of the emulator's side column, in the Tasks interface); web/css/tasks.css (hidden in the classic interface; a
  side tab's label whole, Simulate's too). Test: test/ui/tasks-emu-procs.test.js.
