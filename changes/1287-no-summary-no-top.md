In short:

- With no top module, Implement lists no Design Summary/Reports (only its note and Set Top Module…), and does not open
  the Design Summary by itself.

In detail:

- **Implement with no top module (#1287):** web/js/processes.js (renderProcesses: the list empty under #1224's note),
  web/js/tasks.js (Implement opens the Design Summary itself only with a top). Test: test/ui/tasks-no-top.test.js.
