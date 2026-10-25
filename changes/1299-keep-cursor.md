In short:

- A reload of the page, or a source opened again, comes back to where its cursor was.

In detail:

- **Each source's cursor kept (#1299):** web/js/doc-cursor.js (per project, in this browser, this edition's key; at
  most 50 sources a project), web/js/app.js (kept as the cursor moves; a source opened with no line asked for goes back
  to it). Tests: test/web-doc-cursor.test.js, test/web-prefs.test.js, test/ui/editing.test.js.
