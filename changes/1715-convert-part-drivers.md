In short:

- **Convert to Schematic:** a vector driven part by part in separate statements (`assign y[3:0] = …;
  assign y[7:4] = …;`, `y(3 downto 0) <= …; y(7 downto 4) <= …;`) is converted.

In detail:

- **Convert to Schematic: a vector driven part by part (#1715):** the HDL blocks that write one signal, each a
  driver of its net (refused: "net 'y' has 2 drivers"), become one block holding their statements in order, with
  their pins (a signal it writes no longer one of its inputs).
