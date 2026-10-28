In short:

- **Bus taps both ways, as in ISE:** bit wires driven by input markers (or any output) build a bus through bus taps,
  and an input marker wired to a tap stays an input (it turned into an output).

In detail:

- **A bus tap is a connector (#1796):** a tap whose bit wire is driven by something else drives those bits of its bus
  (`xb(3) <= X3;`); no "2 drivers" on the bit wire, no "no driver" on the bus; a bus driven by its own driver and
  through a tap too, an error. A tap's pins no longer change an I/O marker's direction (#1109).
