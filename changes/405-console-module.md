In detail:

- **app.js split by concern, first part: the console (#405):** the Console / Errors / Warnings tabs (the log, the
  warnings and errors collected from it, the quick fixes of a message, the Clear button) move from `web/js/app.js`
  to `web/js/console.js`, with no change in behaviour; `app.js` imports them and still exports `log` and
  `setDiagnostics`. A unit test (`test/app-modules.test.js`) checks that each part moved out lives in its module
  only and that what `app.js` imports from it is exported there; the next parts of the split add to it.
