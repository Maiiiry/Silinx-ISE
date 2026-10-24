In short:

- **The Processes after opening another project:** its own, not the last project's (their states, the Simulation
  view's processes); also Implement's for a project with no top module.

In detail:

- **The Processes panel drawn again when a project opens (#1162):** a project with no state to restore (no run yet) or
  no top kept the last project's list, caption and states; Implement's side panel (web/js/tasks-impl.js) is drawn
  with none selected when there is no top.
