In short:

- **Clocking Wizard:** New Source ▸ Clocking Wizard writes a module with a DCM (Spartan-3E) or a PLL (Spartan-6)
  for the frequencies you ask, from the board's oscillator: it shows the frequency each output gets and the
  ones near it the device can make. Opening the module in the Design pane reopens the wizard.

In detail:

- **New Source ▸ Clocking Wizard (#793):** the name, language and location; the input clock (the board's
  oscillator by default, from a pin through an IBUFG or not), the reset and LOCKED, on the Spartan-3E the input
  divided by 2 and a fixed phase shift; the outputs: the DCM_SP's nine (CLKDV's divide and CLKFX's multiply /
  divide chosen nearest the frequency asked) or the PLL_BASE's six (one VCO for all, its multiply and divides
  chosen with the smallest error, then the fastest VCO; the phase in eighths of the VCO period), each with the
  frequency it gets and the ones near it the primitive can make; DS312's (Stepping 1) and DS162's ranges, with
  the input divided by 2 trce's halved limits. The module (`core/clocking.js`) has the primitive and a BUFG per
  output (CLK0 fed back to CLKFB, the PLL's feedback internal), its parameters commented, its settings in a
  `silinx-wizard:` header line: the Design pane shows *[Clocking Wizard] [VHDL]*, a double-click, the badge or
  *View/Edit Clocking Wizard* reopen the wizard (a module changed by hand since is said so). Two board tests
  of its output (`feat_clkwiz`, `feat_clkwiz_v`) build on the four Spartan-3E devices of the Silinx toolchain.
  In Portuguese.
