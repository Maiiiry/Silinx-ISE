In short:

- **Fewer menus in the modern interface:** no Project, Process and Tools menus: their commands are the pages' buttons,
  the processes, the toolbar and the right-click menus (and the command palette).

In detail:

- **No Project, Process and Tools menus (#1217):** web/css/tasks.css (hidden in the Tasks layout, by their names:
  web/js/ui.js `data-menu`); the messages that said "Tools ▸ Toolchain
  Settings" name Toolchain Settings, the gear in the toolbar (web/js/implement.js, summary.js, viewers.js, i18n.js).
  Tests: test/ui/app.test.js, test/ui/open-toolchain.test.js.
