In short:

- **A bus tap's MSB never below its LSB:** its Properties refuse an MSB below its LSB (or an LSB above its MSB) and
  say why.

In detail:

- **The bus tap's indices in its Properties (#1815):** a value that would put the MSB below the LSB is refused, the
  field back to its value, the reason in a note (in Portuguese too); the schematic's check (#1691) stays for the
  schematics saved before.
