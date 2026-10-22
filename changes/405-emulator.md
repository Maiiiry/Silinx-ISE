In detail:

- The Board Emulator's code split (#405): its toolbar (`web/js/emulator-toolbar.js`), the board's parts and layout
  (`web/js/emulator-board.js`), the VGA monitor and the side panel (`web/js/emulator-side.js`) and its painting
  (`web/js/emulator-paint.js`), out of `mountEmulator` (535 → 289 lines); no change in behaviour.
