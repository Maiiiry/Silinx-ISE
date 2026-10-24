In short:

- **Opening a project in Design, without getting in the way:** what is opened right after the project (iMPACT, a
  document) stays in front; the app reopening the last project at start-up comes back where the user was.

In detail:

- **Design forward before the opening ends (#1191):** web/js/project.js sends silinx:project-opened inside the opening
  (#1171 sent it a tick after it, over what came next), and not for the reopening at start-up (openProject's startup);
  a document brought to the front that was already in front, behind Design, brings its task forward
  (silinx:doc-activated, web/js/tasks.js); a narrow screen's drawer kept as it was.
