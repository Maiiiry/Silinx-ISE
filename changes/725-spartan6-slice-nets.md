In detail:

- **Spartan-6: the slice settings of the pins (#725):** research/s6/db/xc6slx16-slice-nets.json, measured with ISE
  with a net on every pin of the measured slices (research/s6/gen-slice6.mjs --nets): CLKINV, CEUSED, SRUSED, every
  output mux, the flip-flops' sources from AX … DX, a SLICEM's DI muxes, WEMUX, WA7USED and WA8USED. The carry, F7 / F8
  and the 5-input flip-flops come next. Tests: test/s6-slice.test.js.
