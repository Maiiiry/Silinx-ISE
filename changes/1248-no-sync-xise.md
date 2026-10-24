In short:

- Project ▸ Sync with .xise is gone from the menu: it only overwrote the project's .xise; File ▸ Export Xilinx ISE
  Project (.zip) gives ISE the project.

In detail:

- **Project ▸ Sync with .xise removed (#1248):** web/js/menus.js (the entry, the full application only), web/js/i18n.js
  (its labels); the server's `POST /api/projects/:p/sync-xise` stays. Test: test/ui/app.test.js (the menus have no
  .xise entry).
