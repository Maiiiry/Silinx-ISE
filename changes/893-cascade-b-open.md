In detail:

- **A cascaded multiplier's B left open in Verilog (#893):** a schematic's MULT18X18SIO with B_INPUT CASCADE, its B
  unconnected, is generated in Verilog with `.B()` instead of B tied to zeros, which ISE's map warned about
  (PhysDesignRules:1135); Silinx's elaboration says nothing of a primitive's input left open on purpose (`.B()`), as XST.
  In VHDL B stays tied (UNISIM's component gives it no default; a component of its own makes XST warn Xst:2211 and 753):
  ISE's map still warns there.
