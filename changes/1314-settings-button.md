In short:

- The modern interface's header has a Settings button in place of the light / dark switch: About, Interface,
  Language, Theme, Toolchain Settings, Check for Updates (and at start-up), Keyboard Shortcuts, Tell Us Who You Are.

In detail:

- **The header's Settings (#1314):** web/index.html, web/js/app.js, web/js/menus.js (settingsItems: the View and Help
  menus' entries, shared), web/js/icons.js, web/js/tasks.js, web/js/i18n.js, web/css/modern.css. Tests:
  test/ui/modern.test.js, test/ui/tasks.test.js, test/modern.test.js.
