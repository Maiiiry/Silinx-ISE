In detail:

- **One copy of the helpers (#1858):** core/c-inline.js's deep copy keeping BigInt values is named `cloneBig`, not
  `clone` (core/util.js's), as test/util.test.js asks; no change of behaviour.
