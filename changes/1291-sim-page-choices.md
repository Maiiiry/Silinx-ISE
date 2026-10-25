In short:

- Simulate's choices (the test bench or any design module, Edit, the model) are on Simulate's page, above its Simulate
  button, no longer in the toolbar; its text names SSim, not ISim.
- The toolbar no longer ends with the task's Check, Emulate or Implement button: each task's page has its action.

In detail:

- **Simulate's choices on its page (#1291):** web/js/tasks.js (the test bench / module choice, Edit and the model in
  Simulate's page; its text: "choose a module to simulate with stimuli drawn in SSim"), web/css/tasks.css, web/js/i18n.js.
- **No action button in the toolbar (#1292):** web/js/tasks.js (the task's bar keeps Emulate's document line only),
  web/css/tasks.css.
- Tests: test/ui/tasks.test.js, test/ui/tasks-sim.test.js, test/ui/tablet.test.js.
- **No New Test Bench in Simulate's choice (#1312):** web/js/tasks-sim.js (the choice lists the test benches and the
  design modules), web/js/tasks.js (the page's Create a test bench (Wizard)… button shown whenever there is a design
  module to test).
