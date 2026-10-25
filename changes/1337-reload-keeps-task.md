In short:

- A reload comes back to the task that was in front, also Implement with nothing in it (no top module), not to the task
  of a document reopened (a simulation).

In detail:

- **A reload keeps the task (#1337):** web/js/tasks.js (restoreStartTask: the task in front when the page was left,
  brought back once the last project is reopened), web/js/app.js. Test: test/ui/tasks.test.js.
