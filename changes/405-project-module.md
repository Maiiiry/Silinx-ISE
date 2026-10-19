In detail:

- **app.js split by concern, second part: the project lifecycle (#405):** opening, closing and reloading a project
  (in call order, the queues of #375 unchanged), the recent projects, the Start page and where the browser edition
  keeps the projects (a workspace folder or the browser's storage) move from `web/js/app.js` to `web/js/project.js`,
  with no change in behaviour. The documents of the project left are closed through a new `closeAllDocs()` of
  `app.js`, which keeps its view state as it was (the flag it sets stays inside `app.js`). `test/app-modules.test.js`
  checks the new module, the names it imports from `app.js`, and that the queues are kept as they were.
