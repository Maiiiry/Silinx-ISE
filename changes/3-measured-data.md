In detail:

- **The measured XC3S250E description and its measurements in the repository (#3):** `research/s3e-device/data/xc3s250e`
  holds the observation of ISE's routed designs, the arc probes and the verdicts of every round of join tests (6.3 MB
  gzipped) and the description built from them; `build-measured.mjs` rebuilds it, and a test checks the rebuild is the
  committed file. Step 1 of the plan for replacing the shipped description (research/s3e-device/REPLACING.md); the
  shipped graph is unchanged.
