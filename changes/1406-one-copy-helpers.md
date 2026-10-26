In detail:

- **One copy of each small helper (#1406):** `clone`, `hex2`, `lineStarts`, `isKw` / `isOp`, `tokenText` and a symbol
  parameter's `int` in core/util.js, `cleanLoc` and `portText` in web/js/wizard-util.js, the drawing editors' `sv` in
  web/js/dom.js; the modules that had a copy import it (the old ones still export what they exported), and
  test/util.test.js fails on a new copy. No change of behaviour.
