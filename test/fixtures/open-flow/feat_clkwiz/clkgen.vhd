-- silinx-wizard: {"wizard":"clock","version":1,"family":"spartan3e","speed":"-4","inMHz":50,"input":"clk_in","ibufg":true,"name":"clkgen","lang":"vhdl","reset":"rst","locked":"locked","div2":false,"phaseShift":0,"outputs":[{"pin":"CLK0","port":"clk0"},{"pin":"CLK2X","port":"clk2x"},{"pin":"CLKDV","port":"clkdv","mhz":12.5},{"pin":"CLKFX","port":"clkfx","mhz":65}]}
-- Clocking Wizard (Silinx): a DCM_SP of the Spartan-3E, its outputs on global buffers (BUFG).
-- Do not edit: the module is generated from the line above; open it from the Design pane to change it.
--
--   clk_in          50.000 MHz (20.000 ns)  the input, from a pin (IBUFG)
--   clk0            50.000 MHz (20.000 ns)  CLK0: CLKIN
--   clk2x          100.000 MHz (10.000 ns)  CLK2X: CLKIN x 2
--   clkdv           12.500 MHz (80.000 ns)  CLKDV: CLKIN / 4
--   clkfx           65.000 MHz (15.385 ns)  CLKFX: CLKIN x 13 / 10
--   locked       1 when the outputs are stable (LOCKED)
--   rst          1 resets the DCM (RST; hold it for at least three CLKIN periods)
-- The input's PERIOD constraint (UCF) gives each output its own (derived) for the timing.
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity clkgen is
  port (clk_in  : in  std_logic;
        rst     : in  std_logic;
        clk0    : out std_logic;
        clk2x   : out std_logic;
        clkdv   : out std_logic;
        clkfx   : out std_logic;
        locked  : out std_logic);
end clkgen;

architecture xilinx of clkgen is
  signal clkin_b, clk0_u, clkfb_b, clk2x_u, clkdv_u, clkfx_u, locked_i : std_logic;
begin
  u_ibufg : IBUFG port map (I => clk_in, O => clkin_b);

  u_dcm : DCM_SP
    generic map (
      CLKDV_DIVIDE          => 4.0,
      CLKFX_MULTIPLY        => 13,
      CLKFX_DIVIDE          => 10,
      CLKIN_DIVIDE_BY_2     => FALSE,
      CLKIN_PERIOD          => 20.000,
      CLKOUT_PHASE_SHIFT    => "NONE",
      CLK_FEEDBACK          => "1X",
      DESKEW_ADJUST         => "SYSTEM_SYNCHRONOUS",
      DFS_FREQUENCY_MODE    => "LOW",
      DLL_FREQUENCY_MODE    => "LOW",
      DUTY_CYCLE_CORRECTION => TRUE,
      PHASE_SHIFT           => 0,
      STARTUP_WAIT          => FALSE
    )
    port map (
      CLKIN    => clkin_b,
      CLKFB    => clkfb_b,
      RST      => rst,
      DSSEN    => '0',
      PSCLK    => '0',
      PSEN     => '0',
      PSINCDEC => '0',
      CLK0     => clk0_u,
      CLK90    => open,
      CLK180   => open,
      CLK270   => open,
      CLK2X    => clk2x_u,
      CLK2X180 => open,
      CLKDV    => clkdv_u,
      CLKFX    => clkfx_u,
      CLKFX180 => open,
      LOCKED   => locked_i,
      PSDONE   => open,
      STATUS   => open
    );

  -- CLK0 on a global buffer, fed back to CLKFB (CLK_FEEDBACK 1X)
  u_bufg_clk0 : BUFG port map (I => clk0_u, O => clkfb_b);
  u_bufg_clk2x : BUFG port map (I => clk2x_u, O => clk2x);
  u_bufg_clkdv : BUFG port map (I => clkdv_u, O => clkdv);
  u_bufg_clkfx : BUFG port map (I => clkfx_u, O => clkfx);
  clk0 <= clkfb_b;
  locked <= locked_i;
end xilinx;
