In detail:

- **The Vitis oracle's runs detached (#1669):** `scripts/hls-vitis.mjs --detach` starts Vitis HLS in the background on the
  runner's machine and `--collect <run>` shows its progress or fetches and compares its results, so a run of the whole
  corpus (hours) does not depend on the developer's machine staying awake.
