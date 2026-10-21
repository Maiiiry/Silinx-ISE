In short:

- **Board Emulator, less energy:** it pauses while it is not seen (another browser tab, a minimised window, another
  document tab) and goes on where it was when shown again; the new "When hidden" setting of its toolbar keeps it
  running instead, and is remembered. It draws the board at most 60 times a second, and nothing wakes up while it is
  paused or powered off: hidden, Chrome's CPU drops from about 55 % to under 2 %.

In detail:

- **The Board Emulator while it is not seen, and its drawing (#719):** paused by default while `document.hidden` and
  while its document tab is not the active one (an IntersectionObserver on its element), the status line saying
  "paused while hidden"; seen again, it goes on in real time from where it was (no backlog). "When hidden: Keep
  running" (remembered in `silinx.emulator.hidden`) simulates on and draws nothing. The frames come by
  `requestAnimationFrame` (at most 60 a second, a timer only while it runs hidden), an LED's style, a digit's segments,
  the watched values and the status written only when they changed; no timer while paused or powered off (it was every
  4 ms running and every 30 ms paused). Measured with blinky in Chrome on macOS: running about the same (the worker's
  50 MHz simulation), 0 timers a second instead of 205; behind another document tab 0 % CPU instead of 60 %; hidden
  0.1-1.6 % instead of 53 %; paused 0 timers a second instead of 31. Tests: `test/ui/emu-hidden.test.js`.
