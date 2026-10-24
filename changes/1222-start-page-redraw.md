In detail:

- **The Start page kept when drawn again (#1222):** web/js/project.js (the page the same whether a project is open: the
  exports always links, doing nothing with none; the host's data-project says it), web/css/app.css (their disabled look
  from it), so that a late drawing keeps the page and a click pressed on a recent project is not lost (#494, broken
  by #1216). Test: test/ui/projects.test.js.
