In detail:

- **Memory: closed documents no longer kept by the Tasks interface's Emulate (#879):** its watcher for an emulator's
  board put an observer on every document opened, in every interface, for up to two minutes, so closed documents
  (ISim, the editors, the FPGA view) stayed in memory and `test/ui/memory.test.js` failed. It is now one observer on
  the workspace, connected only in the Tasks interface, with no timer.
