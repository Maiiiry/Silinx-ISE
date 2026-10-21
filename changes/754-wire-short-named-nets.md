In short:

- **Schematic: a wire between two named nets is refused, as in ISE:** drawing a wire from a net named x to a net
  named y (or to an I/O marker's net) no longer makes one net with two names; the status line says the wire would
  short them and to rename one first (the same name connects them).

In detail:

- **A wire that would short two named nets is refused (#754):** the wire was added and the net had two names, the
  drawing keeping both, the HDL one of them, the error "net has several names" found only later. Now, as ISE's
  schematic editor ("Wire would create a short between net x and net y"), a drawn wire joining two nets that each
  have a name of their own (a net name or an I/O marker; VHDL case-insensitive) is not added, and the status line
  says why (core/schdoc.js netShort). Still allowed: the same name, an unnamed net, an output marker on another
  marker's net (assigned, y <= a). Tests: test/sch-netname.test.js (net names, markers, two input markers, VHDL's
  case, the cases allowed, the HDL of an allowed wire compiled and simulated in VHDL and Verilog),
  test/ui/sch-netname.test.js (refused with the note, an allowed wire drawn; both interfaces, English and
  Portuguese).
