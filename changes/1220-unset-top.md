In short:

- **Unset as Top Module:** the top module's right-click menu can unset it: the project has no top until another is set.

In detail:

- **Unset as Top Module (#1220):** web/js/design.js (`topMenuItem`: Set or, on the top, Unset as Top Module;
  `unsetTop`); web/js/drawings.js, drawings-tt.js (the drawings' menus, `drawnTop`); web/js/menus.js (the classic
  Project menu); web/js/i18n.js. Test: test/ui/unset-top.test.js.
