In short:

- Emulate and Program FPGA with no pins set: an alert says the pins are not set yet and should be set first, with
  I/O Pin Planning one click away; nothing emulated nor programmed.

In detail:

- Emulate (the Board Emulator, every model) and Program FPGA (iMPACT, the project's own file) ask first when the
  project has no UCF or its UCF places no port (no LOC): "Pins not set", I/O Pin Planning (opens it) or Cancel; the
  emulator's re-runs on a change say nothing (core/ucf.js ucfPlacesPins, web/js/pins-check.js) (#1508).
