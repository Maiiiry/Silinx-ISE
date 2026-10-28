In short:

- **ISE schematic export of a schematic made from HDL:** each HDL block's file has the module's declarations it
  uses (its generics or parameters, constants, types, functions, macros): the exported project compiles.

In detail:

- **An HDL block's file with the module's declarations (#1695):** an HDL block exported as an ISE symbol of its own
  gets, in its HDL file, the module's context clause (its libraries and packages, its `` `define `` macros), its
  generics / parameters and its declarations (constants, types, functions, localparams), and of the module's
  signals only the block's own temporaries, each declaration whole (a signal or register of several names over
  several lines was copied in part, a syntax error); the others are its ports. A module instanced with no ports (a
  block of a generate not taken, read back from ISE) is written without a port map.
