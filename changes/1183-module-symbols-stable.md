In short:

- **A module's symbol no longer changes under its wires:** when a module's ports change, its instances in the
  schematics keep their pins and connections, are shown as out of date (dashed, a warning in Check Schematic, a note in
  the properties) until Update Symbol, which takes the new ports and keeps each wire on its pin by name.

In detail:

- **Module symbols as placed (#1183):** an instance is drawn from the ports it was placed with (params.ports; an
  instance saved without them takes its module's when the schematic is read); core/schdoc-modsym.js: symbolDiff (the
  ports added, removed or turned), updatedPorts (the pins that stay keep their order, the new ones after them),
  updateModuleSymbols (the wires, I/O markers and net names following their pin by name; a removed or turned pin's wire
  left unconnected, pulled back from a pin that comes in its place; one undo step). The netlist's warning, and an error
  for a pin connected to a port gone or turned; Update Symbol and Update All in the properties; in Portuguese.
