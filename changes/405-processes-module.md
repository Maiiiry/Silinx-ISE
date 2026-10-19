In detail:

- **app.js split by concern, fifth part: the Processes panel (#405):** the processes of the selected source and what
  runs them, Check Syntax with the elaboration's diagnostics, and the processes' status kept in the build folder move
  from `web/js/app.js` to `web/js/processes.js` (about 360 lines), with no change in behaviour; `project.js`,
  `implement.js` and `drawings.js` import from it what they took from `app.js`. `test/app-modules.test.js` checks the
  new module and that every name imported among `app.js` and its modules is exported where it is taken from.
