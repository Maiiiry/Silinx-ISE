In detail:

- **app.js split by concern, eighth part: the viewers (#405):** the RTL and technology schematics, the simulation in
  ISim (the behavioural or a netlist model, its test bench and data files) and the Board Emulator move from
  `web/js/app.js` to `web/js/viewers.js` (about 375 lines), with no change in behaviour; `app.js` drops the imports
  only they used. `test/app-modules.test.js` checks the new module and, for `app.js` and every module split out of
  it, that each name of theirs a module uses is imported or defined there.
