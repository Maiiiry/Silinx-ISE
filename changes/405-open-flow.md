In detail:

- **core/open-flow-core.js split: runOpenFlow's simulation models and its timing, bitstream and reports (#405):**
  the open flow's simulation models (open-flow-models.js) and its timing, bitstreams, back-annotated pins and power
  estimate (open-flow-reports.js) move to mounts of their own, called where they were (runOpenFlow 483 → 247 lines).
  No change in behaviour: every example through every step, from the synthesis to the PROM bitstream, gives the same
  log, reports and files as before, the bitstreams byte for byte. Tests: `test/open-flow-parts.test.js`.
