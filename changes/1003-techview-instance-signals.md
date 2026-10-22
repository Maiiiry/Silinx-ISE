In short:

- **Technology Schematic:** an instance whose registers drive a signal of the top directly (blinky's BCD counter
  driving the display's digits) has its own block, not its cells in the top's logic.

In detail:

- **The Technology Schematic's blocks by instance (#1003):** a cell that drives a signal of the top which is also a
  signal inside an instance (Yosys names the net by its shortest name, the top's: `digits<3>` for `u_count.ones<3>`)
  belongs to that instance (`core/fpga/techview.js`); blinky's view has five blocks (u_count's 84 cells), pong's 19.
