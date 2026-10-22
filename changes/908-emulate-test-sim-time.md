In detail:

- **The #490 emulator test waits for simulated time (#908):** blinky's light first steps 400 ms after the start
  (2.5 steps a second). The test watched the Post-Translate model's LEDs for 4 s of wall time, which on a slow
  runner (8.5 % of real time) was 365 ms simulated, before the first step. It now watches until 1.2 s of
  simulated time, 90 s of wall time at most (test/ui/open-toolchain.test.js).
