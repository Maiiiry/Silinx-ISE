In detail:

- **Loop labels (#1601):** a label before a statement is accepted (`sum_loop: for (…)`, as Vitis HLS names its loops;
  goto still refused): synthesized and simulated as without it, a loop's name in the C Synthesis Report
  (core/c-check.js, c-dataflow.js, c-fsmd.js, c-interp.js, c-asm.js, web/js/c-source.js). Tests: test/c-interp.test.js.
