In short:

- **Layout buttons at the top right:** the side panel, messages and maximize buttons are in the header, right of the
  theme button.

In detail:

- **The layout buttons in the header (#1218):** web/js/tasks.js (`#task-view` after the theme button, its clicks and
  pressed states as before); web/css/tasks.css. Tests: test/ui/tasks.test.js and the tests that use them
  (test/ui/harness.js, sch-layout-fit, tasks-emu-procs).
