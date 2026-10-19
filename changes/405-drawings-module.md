In detail:

- **app.js split by concern, fourth part: the drawings and their HDL (#405):** opening ASM charts, truth tables, state
  diagrams, Petri nets and schematics in their editors, each one's synchronization with the HDL module it is the base
  of, the views of an HDL file, the conversions between them and a drawing whose HDL file name is taken move from
  `web/js/app.js` to `web/js/drawings.js` (about 1050 lines), with no change in behaviour; `project.js` and
  `implement.js` take the names they used from it. `app.js` is down to about 2300 lines.
  `test/app-modules.test.js` checks the new module.
