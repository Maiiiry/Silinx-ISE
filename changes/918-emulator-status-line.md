In short:

- **The Board Emulator's status line no longer disappears:** at some window widths the line at the end of its bar
  (t = … ns · … cycles · … kHz (…% of real time)) shrank to nothing or was cut short; it now goes to a row of its own
  when the controls leave no room for the whole line, in every interface.

In detail:

- **The emulator's status line keeps room for the whole line (#918):** it was `flex: 1 1 0; min-width: 0` in a bar that
  wraps, so it always stayed on the controls' row, shrunk to a few pixels or none when they nearly filled it; with
  `min-width: min(100%, 84ch)` it wraps to a row of its own instead, the whole line shown (on two lines in a window too
  narrow for one, never cut). The UI test scans the window
  from 600 to 1920 px in the modern, classic and Tasks interfaces.
