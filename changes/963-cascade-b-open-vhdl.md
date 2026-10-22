In detail:

- **A cascaded multiplier's B left open in VHDL too (#963):** a schematic's MULT18X18SIO with B_INPUT CASCADE, its B
  unconnected, is generated in VHDL with `B => open` and a component of its own declared in the architecture, its B
  given a default (UNISIM's gives it none) and its BOX_TYPE "PRIMITIVE" as UNISIM's: ISE builds it with no warning (its
  map's PhysDesignRules:1135 gone). Silinx's VHDL keeps a component declaration's ports: an input left open whose
  component gives it a default is not reported as unconnected.
