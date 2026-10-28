In short:

- **Bits of a bus by name, as in ISE:** a wire named `a(0)` (or `a(3:2)`, `a<1>`) is that bit of the bus `a`: a bus
  tap's wire named after its bit, a bit read or driven anywhere by its name, a bus made of its bits' wires.

In detail:

- **Net names of bus bits (#1688):** `a(0)` was refused as an invalid net name. It now names those bits of the bus
  `a` (an I/O marker's, or a net named `a`; a bus named by its bits only is declared from them): its own net, joined
  by name with the same bits, written `a(0)` / `a[0]` in the HDL (read and driven); a tap whose wire is named with
  the bits it takes writes nothing; other bits, or bits outside the bus, an error. The ISE export names them so.
