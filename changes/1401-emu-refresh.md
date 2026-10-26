In short:
- Board Emulator: it runs the design again by itself when a source or the constraints (the pins) change.

In detail:
- Board Emulator: a change of the design (a source or a drawing saved with a change, I/O Pin Planning, the UCF saved) runs its emulation again, its settings kept (engine, timing), behind the document in front, which stays there with its task; a save with no change runs nothing again; a netlist's emulation says in the console that it is the one before (emulated again, the netlist is generated anew) (#1401).
