In detail:

- **core/interp.js split: formatting and std.textio (#405):** the simulator's strings and formatting
  (interp-format.js: images, times, $display's formats) and std.textio with math_real (interp-textio.js) move to
  modules of their own; interp.js still exports them (interp.js 1105 → 865 lines). No change in behaviour: every HDL
  folder of the repository elaborates the same, and the designs that simulate standalone give the same values and
  messages over 5 µs. Tests: `test/interp-parts.test.js`.
