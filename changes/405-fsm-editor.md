In detail:

- The state diagram editor's code split (#405): its history (`web/js/fsm-history.js`), its view
  (`web/js/fsm-view.js`), its inline editing (`web/js/fsm-inline.js`), its pointer and keys (`web/js/fsm-pointer.js`)
  and its bottom panel, the tables, the HDL and the simulation (`web/js/fsm-bottom.js`), out of `mountFsmEditor`
  (718 → 292 lines); no change in behaviour.
