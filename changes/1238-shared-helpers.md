In detail:

- **Helpers taken from the module that has them (#1238):** core/compiled-words.js and compiled-tables.js use
  core/compiled-helpers.js's `int`, `pbits` and `isConst` (now there); the Spartan-6 placer uses core/fpga/place.js's
  `crossing`; core/synth-open-path.js uses core/lut-resynth.js's `LEVEL_CELL` / `COMB_CELL`. No change of behaviour.
