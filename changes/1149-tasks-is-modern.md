In short:

- **The Tasks interface is now the modern one:** View ▸ Interface offers Modern (the layout by tasks: Design, Simulate,
  Emulate, Implement, Program) and Classic; Modern is the default, in every edition. The modern interface of before,
  with its views and Processes panel, is gone (the classic interface keeps them).

In detail:

- **Modern is the Tasks layout (#1149):** web/js/modern.js (two interfaces; a stored 'tasks' read as Modern), the View
  menu, index.html's early script.
- **A new test bench selected in its tree in the modern interface (#1149):** showInSim found it in the Design pane
  only.
- **The UI tests in the new modern interface (#1149):** the harness reads the whole console (the message centre
  filters by task), sets the view and opens a side-panel page through the app or Design, acts on a hierarchy or
  Processes row a task does not show, shows the messages and the side panel when a task has them folded; a test of
  the classic interface's own parts (its views, its Processes panel) says so (uiTest's `ui: 'classic'`); the old
  modern interface's tests removed or turned into the classic interface's.
