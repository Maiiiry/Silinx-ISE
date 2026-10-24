In short:

- With no project open, the Simulate, Emulate and Implement buttons are off and Design (its Start page) is in front.

In detail:

- **The tasks off with no project (#1260):** web/js/tasks.js (refreshDots: the buttons off, Design brought back when a
  project closes; setTask refuses another task with no project), web/css/tasks.css (their look). Test:
  test/ui/tasks.test.js.
