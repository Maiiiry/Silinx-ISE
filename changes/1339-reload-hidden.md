In short:

- A reload (or a project opened) no longer flashes every document by as they reopen: they reopen out of sight, and the
  work area shows once where one was.

In detail:

- **Documents reopened out of sight (#1339):** web/js/project.js (data-restoring while a project's documents reopen),
  web/js/app.js (at start-up, until the task in front is back too, #1337), web/css/app.css (the work area hidden then).
  Test: test/ui/tasks.test.js.
