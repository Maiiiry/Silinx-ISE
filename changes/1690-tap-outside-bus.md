In detail:

- **A bus tap of bits its bus does not have (#1690):** an error on the tap in the schematic's check (`bus tap XLXI_1
  takes bit 5, outside its bus 'a' (3 downto 0)`); before, nothing was said on the drawing, and the generated HDL
  failed in simulation.
