In short:

- The modern interface has no menu bar: the toolbar is in the header, where the menus were, without its Stop,
  Toolchain Settings and About buttons (the header's Settings has them). The classic interface keeps its menus.

In detail:

- **No menu bar in the modern interface (#1321):** web/css/tasks.css (the menu bar hidden; the toolbar's look in the
  header, Stop, Toolchain Settings, About and the separators after Find hidden), web/js/tasks.js (the toolbar moved into
  the header, back under it in the other interfaces). Tests: test/ui/app.test.js, test/ui/tasks.test.js, test/ui/modern.test.js, test/ui/dark-contrast.test.js, test/ui/tablet.test.js, test/ui/standalone.test.js; test/ui/harness.js shows a hidden menu's popup (its submenus hovered, its items clicked); a development build's Development menu under Settings.
