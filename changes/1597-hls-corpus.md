In detail:

- **The HLS corpus (#1597):** test/hls-corpus: AMD's Vitis HLS Introductory Examples (Apache-2.0) at a pinned commit
  (manifest.json, written by scripts/hls-corpus-manifest.mjs from each example's hls_config.cfg; the files fetched into
  .cache/ by scripts/fetch-design-corpus.mjs, never committed) through Silinx C's C simulation (the example's own test
  bench), C synthesis (VHDL and Verilog) and co-simulation, compared with expected.json (`npm run test:hls`,
  `--update`); the README's table gives each design's result and the first reason it stops (the C++ ones: #1590;
  the C ones: their test benches' C library, #1598, and pointer variables, #1599). Tests: test/hls-corpus.test.js.
