In short:

- **Menus inside the window:** a menu or a submenu near the window's right edge (the Development menu on a 1024 px
  window, an iPad's) opens inside it, on the left when there is no room on the right; a long change title is cut with
  an ellipsis, whole in its tooltip.

In detail:

- **A menu and its submenus kept inside the window (#767):** web/js/ui.js menuBar and buildMenu move a menu left, a
  submenu to its menu's left (or against the window's edge) when it would run past the right edge, and up past the
  bottom; the Development menu's change titles at most 60 characters wide (web/css/app.css), whole in the item's
  tooltip. Test: test/ui/dev-menu.test.js (a 1024 px window, a long title: the menu and the submenu inside it, the
  title cut, its tooltip whole; both interfaces).
