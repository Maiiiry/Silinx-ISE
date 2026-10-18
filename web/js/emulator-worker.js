// Web Worker: the Board Emulator's compiled engine (#427), off the page's thread: core/emulate-remote.js
// hostBoard on the worker's port; web/js/emulator.js starts it (from this file on the local server, from
// its embedded text in the single-file edition) and drives it through a RemoteBoard.
import { hostBoard } from '/core/emulate-remote.js';

hostBoard(self);
