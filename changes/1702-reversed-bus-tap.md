In short:

- **A bus tap the wrong way round:** its output on a bus no longer turns the bus into a 1-bit wire. The bus stays a
  bus, the tap is not connected to it, and Check says the tap is the wrong way round.

In detail:

- **Schematic: a bus tap the wrong way round keeps the bus a bus (#1702):** a bus tap's output O on a wider bus
  (driven by an input marker or a symbol's output, or named) is not joined to the bus's net: the bus keeps its
  width (a counter's Q(7:0) no longer became a 1-bit net, drawn as a wire), and one error on the tap says it is
  the wrong way round, in place of the bus's "width mismatch" and "2 drivers". A tap's O into a wider input is
  still a width mismatch.
