In short:

- The application's Start page says where its projects are kept: Where Projects Are Kept, with the workspace folder.

In detail:

- **Where the application keeps its projects (#1297):** server/server.js (GET /api/workspace: the workspace folder),
  web/js/api.js, web/js/project.js (the Start page's box, information only, without the browser edition's folder
  commands), web/css/app.css, web/js/i18n.js. Tests: test/server-api.test.js, test/ui/projects.test.js.
