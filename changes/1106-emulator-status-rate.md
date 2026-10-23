In short:

- **The Board Emulator's status line is readable while it runs:** the time, the cycles and the rate change twice a
  second, not on every frame (it flickered).

In detail:

- **The status line's rewrites (#1106):** while the emulator runs, web/js/emulator-paint.js rewrites it STAT_MS
  (500 ms) apart at most; paused, stepped, powered off or stopped by an error, at once. It was every frame, 180
  rewrites in 3 s.
