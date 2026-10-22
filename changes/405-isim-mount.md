In detail:

- ISim's window code split again (#405): its toolbar (`web/js/isim-toolbar.js`), its view of time and scrollbars
  (`web/js/isim-view.js`), its status bar and cursor (`web/js/isim-status.js`), its public API with the state saved
  and restored and the VCD export (`web/js/isim-api.js`), and its colours (`web/js/isim-colors.js`), out of
  `mountISim` (538 → 295 lines); no change in behaviour.
