In detail:

- **mountISim split, tenth part: the context menu and the instance tree in web/js/isim-menu.js and
  web/js/isim-tree.js (#405):** ISim's context menu (its submenus, closed by a click elsewhere or Escape) and the
  instance tree (the instances and their processes, the selection, their menu, an instance added to the wave window)
  move from mountISim to mountMenu(ctx) and mountTree(ctx), called at the same point of the mount; no change in
  behaviour. Tests: `test/ui/isim-menu.test.js` and `test/ui/isim-tree.test.js`, each mounted alone.
