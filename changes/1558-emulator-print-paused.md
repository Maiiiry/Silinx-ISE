In detail:

- **The emulator print test reads a still board (#1558):** test/ui/print-emulator.test.js waits for the paused emulator's
  time to stop changing (a run begun before the pause ends after it) before comparing the printed page with it.
