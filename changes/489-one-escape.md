In detail:

- **Web client, one HTML escape (#489):** the nine local copies of `esc` (three character sets: `&<>` only in
  the HDL editor's hover and the state diagram's highlighter, no `'` in the print page) are replaced by one,
  `esc` of the new side-effect-free `web/js/dom.js`, which escapes `& < > " '` and turns null / undefined into
  nothing; the schematic demo page imports it too. `test/web-dom.test.js` checks it and that no module or
  page of web/ defines an escape of its own.
