# HLS corpus: AMD's Vitis HLS examples through Silinx C

The C to HDL tests check Silinx C on designs written for them. This corpus (#1597) takes **AMD's Vitis HLS
Introductory Examples** ([Xilinx/Vitis-HLS-Introductory-Examples](https://github.com/Xilinx/Vitis-HLS-Introductory-Examples),
Apache-2.0: the examples of UG1399) through Silinx's HLS flow, as the design corpus (`test/designs-corpus`) takes real
designs through the toolchain:

    npm run test:hls                       # every design, compared with expected.json
    npm run test:hls -- --filter pointer
    npm run test:hls -- --update           # record the results as the expectations, and the table below

Not part of `npm test` (it needs the network once).

- **The designs**: `manifest.json`, written by `scripts/hls-corpus-manifest.mjs` from the repository at a **pinned
  commit**: one design per example folder with an `hls_config.cfg` (its `syn.top`, `syn.file`, `tb.file`), the
  headers beside its sources, its language (C when every source is `.c`). The files are fetched by
  `scripts/fetch-design-corpus.mjs` into `.cache/designs-corpus/` (git-ignored), never committed.
- **The stages**: the C simulation (the example's own test bench, `main()`: it passes when it returns 0), the C
  synthesis (VHDL and Verilog), the C/RTL co-simulation (its calls of the top function replayed on the VHDL), its
  latency; a C++ example is skipped (#1590). The first reason a design stops is recorded.
- **The expectations**: `expected.json`; a run fails on any difference (a design that passes a stage it did not, or
  no longer passes one): record an improvement with `--update`, and make an issue of a loss.

## The results

<!-- results -->
| Design | Language | C simulation | C synthesis | Co-simulation | Latency | Why not |
|---|---|---|---|---|---|---|
| array-array-partition-block-cyclic | C++ | skip | skip | skip | - | C++ (#1590) |
| array-array-partition-complete | C++ | skip | skip | skip | - | C++ (#1590) |
| dsp-fft-interface-array | C++ | skip | skip | skip | - | C++ (#1590) |
| dsp-fft-interface-array-float-ssr2 | C++ | skip | skip | skip | - | C++ (#1590) |
| dsp-fft-interface-stream | C++ | skip | skip | skip | - | C++ (#1590) |
| dsp-fft-interface-stream-float-ssr2 | C++ | skip | skip | skip | - | C++ (#1590) |
| dsp-fft-logicore-fft-float-ssr | C++ | skip | skip | skip | - | C++ (#1590) |
| dsp-fir-decimator | C++ | skip | skip | skip | - | C++ (#1590) |
| interface-aggregation-disaggregation-aggregation-of-m-axi-ports | C++ | skip | skip | skip | - | C++ (#1590) |
| interface-aggregation-disaggregation-aggregation-of-nested-structs | C++ | skip | skip | skip | - | C++ (#1590) |
| interface-aggregation-disaggregation-aggregation-of-struct | C++ | skip | skip | skip | - | C++ (#1590) |
| interface-aggregation-disaggregation-auto-disaggregation-of-struct | C++ | skip | skip | skip | - | C++ (#1590) |
| interface-aggregation-disaggregation-disaggregation-of-axis-port | C++ | skip | skip | skip | - | C++ (#1590) |
| interface-aggregation-disaggregation-struct-ii-issue | C++ | skip | skip | skip | - | C++ (#1590) |
| interface-memory-burst-rw | C++ | skip | skip | skip | - | C++ (#1590) |
| interface-memory-coefficient-filter | C | fail | fail | skip | - | C simulation: hamming_window.h:19: the header 'math.h' is not one of Silinx C's (ap_int.h, stdint.h, stdbool.h, stdio.h) |
| interface-memory-ecc-flags | C++ | skip | skip | skip | - | C++ (#1590) |
| interface-memory-lmem-2rw | C++ | skip | skip | skip | - | C++ (#1590) |
| interface-memory-manual-burst-manual-burst-example-auto-burst-inference-failure | C++ | skip | skip | skip | - | C++ (#1590) |
| interface-memory-manual-burst-manual-burst-example-manual-burst-inference-success | C++ | skip | skip | skip | - | C++ (#1590) |
| interface-memory-manual-burst-manual-burst-with-conditionals | C++ | skip | skip | skip | - | C++ (#1590) |
| interface-memory-max-widen-port-width | C++ | skip | skip | skip | - | C++ (#1590) |
| interface-memory-ram-uram | C++ | skip | skip | skip | - | C++ (#1590) |
| interface-memory-rom-lookup-table-math | C++ | skip | skip | skip | - | C++ (#1590) |
| interface-memory-using-axi-master | C++ | skip | skip | skip | - | C++ (#1590) |
| interface-register-using-axi-lite-with-user-defined-offset | C++ | skip | skip | skip | - | C++ (#1590) |
| interface-streaming-axi-stream-custom-side-channel-data-2 | C++ | skip | skip | skip | - | C++ (#1590) |
| interface-streaming-axi-stream-to-master | C++ | skip | skip | skip | - | C++ (#1590) |
| interface-streaming-axis-array-stream-no-side-channel-data | C++ | skip | skip | skip | - | C++ (#1590) |
| interface-streaming-using-array-of-streams | C++ | skip | skip | skip | - | C++ (#1590) |
| interface-streaming-using-axi-stream-with-side-channel-data | C++ | skip | skip | skip | - | C++ (#1590) |
| interface-streaming-using-axi-stream-with-struct | C++ | skip | skip | skip | - | C++ (#1590) |
| migration-python-scripts | C | fail | fail | skip | - | C simulation: pointer_basic_test.c:109: the header 'stdlib.h' is not one of Silinx C's (ap_int.h, stdint.h, stdbool.h, stdio.h) |
| migration-vitis-unified-cli | C | fail | fail | skip | - | C simulation: pointer_basic_test.c:109: the header 'stdlib.h' is not one of Silinx C's (ap_int.h, stdint.h, stdbool.h, stdio.h) |
| misc-initialization-and-reset-static-array-rom | C++ | skip | skip | skip | - | C++ (#1590) |
| misc-malloc-removed | C | fail | fail | skip | - | C simulation: malloc_removed_test.c:109: the header 'stdlib.h' is not one of Silinx C's (ap_int.h, stdint.h, stdbool.h, stdio.h) |
| misc-rtl-as-blackbox | C++ | skip | skip | skip | - | C++ (#1590) |
| modeling-pointers-basic-arithmetic | C | fail | fail | skip | - | C simulation: pointer_arith_test.c:16: the header 'stdlib.h' is not one of Silinx C's (ap_int.h, stdint.h, stdbool.h, stdio.h) |
| modeling-pointers-multiple-pointers | C | fail | fail | skip | - | C simulation: 23: 'ptr': a pointer variable is not possible in Silinx C (pointers only as arguments; use an array index) |
| modeling-pointers-native-casts | C | fail | fail | skip | - | C simulation: pointer_cast_native_test.c:109: the header 'stdlib.h' is not one of Silinx C's (ap_int.h, stdint.h, stdbool.h, stdio.h) |
| modeling-pointers-stream-better | C | fail | fail | skip | - | C simulation: pointer_stream_better_test.c:109: the header 'stdlib.h' is not one of Silinx C's (ap_int.h, stdint.h, stdbool.h, stdio.h) |
| modeling-pointers-stream-good | C | fail | fail | skip | - | C simulation: pointer_stream_good_test.c:16: the header 'stdlib.h' is not one of Silinx C's (ap_int.h, stdint.h, stdbool.h, stdio.h) |
| modeling-pointers-using-double | C | fail | fail | skip | - | C simulation: 19: the parameter 'flagPtr': a pointer to a pointer is not possible (Silinx C: pointers only to arguments) |
| modeling-conditional-control-of-pragmas-using-defines | C++ | skip | skip | skip | - | C++ (#1590) |
| modeling-conditional-control-of-pragmas-using-template-function | C++ | skip | skip | skip | - | C++ (#1590) |
| modeling-cpp-templates-for-multiple-instances | C++ | skip | skip | skip | - | C++ (#1590) |
| modeling-fixed-point-sqrt | C++ | skip | skip | skip | - | C++ (#1590) |
| modeling-free-running-kernel-remerge-ii4to1 | C++ | skip | skip | skip | - | C++ (#1590) |
| modeling-using-arbitrary-precision-arith | C++ | skip | skip | skip | - | C++ (#1590) |
| modeling-using-arbitrary-precision-casting | C++ | skip | skip | skip | - | C++ (#1590) |
| modeling-using-array-stencil-1d | C++ | skip | skip | skip | - | C++ (#1590) |
| modeling-using-array-stencil-2d | C++ | skip | skip | skip | - | C++ (#1590) |
| modeling-using-cpp-templates | C++ | skip | skip | skip | - | C++ (#1590) |
| modeling-using-fixed-point | C++ | skip | skip | skip | - | C++ (#1590) |
| modeling-using-float-and-double | C | fail | fail | skip | - | C simulation: fp_mul_pow2_test.c:17: the header 'math.h' is not one of Silinx C's (ap_int.h, stdint.h, stdbool.h, stdio.h) |
| modeling-using-vectors | C++ | skip | skip | skip | - | C++ (#1590) |
| modeling-variable-bound-loops | C++ | skip | skip | skip | - | C++ (#1590) |
| pipelining-functions-function-instantiate | C++ | skip | skip | skip | - | C++ (#1590) |
| pipelining-functions-hier-func | C++ | skip | skip | skip | - | C++ (#1590) |
| pipelining-loops-imperfect-loop | C++ | skip | skip | skip | - | C++ (#1590) |
| pipelining-loops-perfect-loop | C++ | skip | skip | skip | - | C++ (#1590) |
| pipelining-loops-using-free-running-pipeline | C++ | skip | skip | skip | - | C++ (#1590) |
| task-level-parallelism-control-driven-channels-autorestart | C++ | skip | skip | skip | - | C++ (#1590) |
| task-level-parallelism-control-driven-channels-merge-split-merge-load-balance | C++ | skip | skip | skip | - | C++ (#1590) |
| task-level-parallelism-control-driven-channels-merge-split-merge-round-robin | C++ | skip | skip | skip | - | C++ (#1590) |
| task-level-parallelism-control-driven-channels-merge-split-split-load-balance | C++ | skip | skip | skip | - | C++ (#1590) |
| task-level-parallelism-control-driven-channels-merge-split-split-round-robin | C++ | skip | skip | skip | - | C++ (#1590) |
| task-level-parallelism-control-driven-channels-simple-fifos | C++ | skip | skip | skip | - | C++ (#1590) |
| task-level-parallelism-control-driven-channels-using-fifos | C++ | skip | skip | skip | - | C++ (#1590) |
| task-level-parallelism-control-driven-channels-using-stream-of-blocks | C++ | skip | skip | skip | - | C++ (#1590) |
| task-level-parallelism-data-driven-mixed-control-and-data-driven | C++ | skip | skip | skip | - | C++ (#1590) |
| task-level-parallelism-data-driven-simple-data-driven | C++ | skip | skip | skip | - | C++ (#1590) |
| task-level-parallelism-data-driven-unique-task-regions | C++ | skip | skip | skip | - | C++ (#1590) |

73 designs: 0 through co-simulation.
<!-- /results -->
