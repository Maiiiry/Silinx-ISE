In detail:

- **The Windows unit tests within their 45 minutes again (#566):** the simulation models' tests ran in one
  file, one after another: every example's test bench on both models, in VHDL and in Verilog, about 25
  minutes on Linux and over 45 on Windows, which cancelled the shard. The examples' tests are now in two
  files of their own (test/sim-model-examples.test.js, test/sim-model-vga.test.js) that run alongside the
  others, and each example's synthesis and Translate run once for both models. CI's unit tests print each
  test file's time at the end, the slowest first, and a file over 15 minutes is a warning
  (scripts/test-file-times.mjs).
