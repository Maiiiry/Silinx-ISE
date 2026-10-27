In short:

- **The bus tap drawn as in ISE:** a diagonal entry from the bus to the bit(s) it takes, so which side is the bus
  is seen at a glance; the bits (`A(0)`, `A(5:2)`) are written on its wire, inside the symbol. Schematics saved
  before are converted when opened, every connection kept.

In detail:

- **The bus tap's symbol (#1726):** its input on the bus, a diagonal entry from there to its output's line a grid
  step aside, the bus's name and the bits taken on the output's wire from the diagonal's end outwards (beside it when
  turned). Document version 5: a schematic of before has what met a tap's old input taken to the new one (a bus wire
  along the move lengthened or shortened, else a bus wire added; `core/schdoc-upgrade.js`). An ISE schematic's bus tap
  imported with its output on ISE's bit wire and its input on its bus (no extra wire). The gates example redrawn with
  its taps on its bus, as ISE draws them.
