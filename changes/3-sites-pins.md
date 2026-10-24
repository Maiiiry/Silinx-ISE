In detail:

- **Device measurements, the sites' pins (#3):** observation designs that use every pin of the block RAMs, multipliers,
  DCMs and I/O blocks (`gen-obspins.mjs`), and an observer that reads the clock tiles' pins too. 17 509 pin facts from
  102 ISE designs, every one agreeing with the shipped graph: every RAMB16 and BUFGMUX pin, the others but the test,
  differential, PCI and DDR-cascade pins Silinx does not use (`prototype.mjs pins`).
