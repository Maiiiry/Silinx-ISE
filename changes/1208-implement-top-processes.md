In short:

- **Implement's processes always there:** Implement lists the top module's processes even after something else was
  selected in the Design pane (it showed only Design Summary/Reports).

In detail:

- **Implement's processes the top's (#1208):** web/js/processes.js (in Tasks ▸ Implement the list and its caption are
  the top module's, whatever the selection; no "not the top" question there); web/js/tasks.js (the Processes drawn once
  the task is set, the selection's again in another task). Test: test/ui/tasks.test.js.
