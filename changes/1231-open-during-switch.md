In short:

- **Opening a file:** a file still being read when another project is opened is no longer opened in that project.

In detail:

- **A document opened for the project it was read from (#1231):** web/js/app.js `openFile` and the drawings' openers
  (web/js/drawings.js, drawings-tt.js) read from the project open at the start and open nothing when another project
  was opened during the read (project A's text was shown, and saved, as project B's file of the same path).
