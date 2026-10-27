In detail:

- **A bus tap with its MSB below its LSB (#1691):** an error on the tap (`bus tap XLXI_1: its MSB (1) is below its
  LSB (2): a bus tap takes the bits MSB downto LSB`); before, it wrote `a(1 to 2)` / `a[1:2]` of a descending bus,
  which neither language allows (XST refuses it).
