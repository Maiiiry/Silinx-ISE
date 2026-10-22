In detail:

- **core/fpga/place.js split: place in seven parts (#405):** the placer's parts before the annealing move to modules
  of their own, each called where its code was: the pads and clock reach (place-pads.js), the DCMs
  (place-dcms.js), the I/O pads (place-iobs.js), the global clock buffers (place-bufgs.js), the block RAMs and
  multipliers (place-hard.js), the slices (place-slices.js), and the annealing's moves (place-moves.js) (place
  888 → 239 lines; place.js 1222 → 580). No change in behaviour: the 342 placements of the placer's, the router's
  and the I/O registers' tests are byte-identical to before, in the same time. Tests: `test/place-parts.test.js`.
