// silinx-wizard: {"wizard":"clock","version":1,"family":"spartan3e","speed":"-4","inMHz":50,"input":"clk_in","ibufg":true,"name":"clkgen","lang":"verilog","reset":"","locked":"locked","div2":false,"phaseShift":32,"outputs":[{"pin":"CLK0","port":"clk0"},{"pin":"CLK90","port":"clk90"},{"pin":"CLKFX","port":"clkfx","mhz":25}]}
// Clocking Wizard (Silinx): a DCM_SP of the Spartan-3E, its outputs on global buffers (BUFG).
// Do not edit: the module is generated from the line above; open it from the Design pane to change it.
//
//   clk_in          50.000 MHz (20.000 ns)  the input, from a pin (IBUFG)
//   clk0            50.000 MHz (20.000 ns)  CLK0: CLKIN
//   clk90           50.000 MHz (20.000 ns)  CLK90: CLKIN, 90°
//   clkfx           25.000 MHz (40.000 ns)  CLKFX: CLKIN x 2 / 4
//   locked       1 when the outputs are stable (LOCKED)
// Phase shift: 32 / 256 of the CLKIN period (45.0°, 2.500 ns), on every output.
// The input's PERIOD constraint (UCF) gives each output its own (derived) for the timing.
`timescale 1ns / 1ps

module clkgen (
  input  wire clk_in,
  output wire clk0,
  output wire clk90,
  output wire clkfx,
  output wire locked
);

  wire clkin_b, clk0_u, clkfb_b, clk90_u, clkfx_u, locked_i;

  IBUFG u_ibufg (.I(clk_in), .O(clkin_b));

  DCM_SP #(
    .CLKDV_DIVIDE          (2.0),
    .CLKFX_MULTIPLY        (2),
    .CLKFX_DIVIDE          (4),
    .CLKIN_DIVIDE_BY_2     ("FALSE"),
    .CLKIN_PERIOD          (20.000),
    .CLKOUT_PHASE_SHIFT    ("FIXED"),
    .CLK_FEEDBACK          ("1X"),
    .DESKEW_ADJUST         ("SYSTEM_SYNCHRONOUS"),
    .DFS_FREQUENCY_MODE    ("LOW"),
    .DLL_FREQUENCY_MODE    ("LOW"),
    .DUTY_CYCLE_CORRECTION ("TRUE"),
    .PHASE_SHIFT           (32),
    .STARTUP_WAIT          ("FALSE")
  ) u_dcm (
    .CLKIN    (clkin_b),
    .CLKFB    (clkfb_b),
    .RST      (1'b0),
    .DSSEN    (1'b0),
    .PSCLK    (1'b0),
    .PSEN     (1'b0),
    .PSINCDEC (1'b0),
    .CLK0     (clk0_u),
    .CLK90    (clk90_u),
    .CLK180   (),
    .CLK270   (),
    .CLK2X    (),
    .CLK2X180 (),
    .CLKDV    (),
    .CLKFX    (clkfx_u),
    .CLKFX180 (),
    .LOCKED   (locked_i),
    .PSDONE   (),
    .STATUS   ()
  );

  // CLK0 on a global buffer, fed back to CLKFB (CLK_FEEDBACK 1X)
  BUFG u_bufg_clk0 (.I(clk0_u), .O(clkfb_b));
  BUFG u_bufg_clk90 (.I(clk90_u), .O(clk90));
  BUFG u_bufg_clkfx (.I(clkfx_u), .O(clkfx));
  assign clk0 = clkfb_b;
  assign locked = locked_i;

endmodule
