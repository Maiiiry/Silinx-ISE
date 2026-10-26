In detail:

- **One copy of clone (#1580):** the C to HDL state machines' deep copy, which keeps BigInt values (core/c-fsmd.js), is
  named cloneBig: not a copy of core/util.js's clone.
