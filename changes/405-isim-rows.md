In detail:

- **mountISim split, ninth part: the rows of the wave window in web/js/isim-rows.js (#405):** the rows model (the
  signals, dividers and groups, the lines shown with a bus's bits, a bit's wave, the value at a time) and the rows'
  commands (Delete, New Group, Ungroup, the dividers, the radix, the rows' menu) move from mountISim to
  mountRows(ctx), called where the rows model was; no change in behaviour. Tests: `test/web-isim-rows.test.js`, the
  rows on the simulator.
