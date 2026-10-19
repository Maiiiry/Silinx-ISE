In detail:

- **app.js split by concern, third part: the implementation processes (#405):** ISE's flow run step by step with
  its live status, Check Constraints and the UCF made from the board, the open synthesis (Yosys in the browser),
  the optional processes (simulation models, post-place & route timing, power, pin back-annotation) and Stop move
  from `web/js/app.js` to `web/js/implement.js` (about 400 lines), with no change in behaviour.
  `test/app-modules.test.js` checks the new module and, for every module split out, that its top level reads
  nothing from `app.js` (they import each other).
