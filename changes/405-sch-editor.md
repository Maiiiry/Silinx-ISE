In detail:

- The schematic editor's code split (#405): its skeleton, toolbar, palette, view, edits, selection operations,
  mouse, keyboard, Check, Try it, Symbol Info and small helpers in modules of their own (`web/js/sch-dom.js`,
  `sch-toolbar.js`, `sch-palette.js`, `sch-view.js`, `sch-edits.js`, `sch-select.js`, `sch-mouse.js`, `sch-keys.js`,
  `sch-check.js`, `sch-try.js`, `sch-info.js`, `sch-ui.js`), out of `mountSchEditor` (874 → 299 lines); no change in
  behaviour. The last function over the limit: `test/code-size.test.js`'s lists are empty.
