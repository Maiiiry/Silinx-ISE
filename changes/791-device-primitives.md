In short:

- **Device Primitives in the schematic library:** the target device's block RAMs, multipliers / DSP slices, DCM /
  PLL and clock buffers as symbols of their own, the ones of the project's family (Spartan-3E: RAMB16_S*, single
  and dual port, MULT18X18SIO, DCM_SP, BUFG, BUFGMUX, IBUFG; Spartan-6: RAMB8BWER, RAMB16BWER, DSP48A1, PLL_BASE,
  DCM_SP, BUFG, BUFIO2), their attributes in the Properties panel, their count on the device in Symbol Info.

In detail:

- **The schematic's Device Primitives (#791):** a category of the palette with the primitives of the project's
  family, following it when the device changes (core/primitives.js, one list read by the library and the
  templates); each symbol has UNISIM's pins and its attributes as parameters (their ranges checked: a value out of
  range an error), a block RAM's width and its initial contents (hex words from address 0, its INIT_xx); the
  generated HDL instances the primitive itself (VHDL with `library UNISIM`, Verilog), an unconnected input tied
  to its inactive value, a needed one (a clock, an address, a DCM's feedback) a warning; Symbol Info gives its
  resource on the device and the schematic's use of it ("Block RAM (18 Kb): 12 on this device, 2 used").
- **PLL_BASE and BUFIO2 simulated (#791):** functional models of the Spartan-6 PLL (CLKOUT0-5 at the VCO's
  frequency divided, their duty cycle and phase, LOCKED) and I/O clock buffer (IOCLK, DIVCLK divided,
  SERDESSTROBE).
- **The device resources' test (#826):** its shipped devices' check takes the Spartan-3E ones, the Spartan-6
  device descriptions shipped too.
