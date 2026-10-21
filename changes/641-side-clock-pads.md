In short:

- **Clocks on the side GCLK pins:** a clock on a left or right global clock pin goes on its own side global buffer
  through the dedicated path, as ISE places it, without a warning.

In detail:

- **The side clock pads' dedicated paths in the bit database (#641):** measured with ISE on the four devices (each side
  clock pad on the buffer ISE's placer gives it): the side clock tiles' CKIk -> GCLKk, one bit each; the pads' pin
  switches set none. The nearest side buffer a pad reaches on known switches is the one ISE gives it (the 58 measured),
  and the placer puts a clock on a side GCLK pin there instead of on a top / bottom buffer through general routing; the
  router no longer takes the pad's own IOIS_Yk -> IOIS_Fk_B3 in the CLK_PCI I/O tiles (`noRoutePips`). A new
  open-flow fixture, feat_side_clock.
