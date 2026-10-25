In short:

- A task with no document open (Simulate with no test bench yet, Design with nothing open) no longer shows an empty
  grey tab bar above its page.

In detail:

- **No empty tab bar (#1289):** web/js/tasks.js (tagDocs: data-nodocs when the task has no document), web/css/tasks.css.
  Tests: test/ui/tasks.test.js, test/ui/dark-contrast.test.js.
