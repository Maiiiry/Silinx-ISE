In short:

- **More global clocks in the Silinx toolchain:** more than eight global clocks (the left and right sides'
  global buffers too; each line of the clock network then serves one clock per half of the chip).

In detail:

- **Silinx toolchain: the side global buffers (#95):** the placer uses the 16 global buffers of the left and
  right sides (their bits measured in #45): a side buffer `BUFGMUX_X0Y(2+k)` / `X3Y(2+k)` sits on line k of
  its half of the chip, its loads in that half; the top / bottom buffer of line k is then kept out of that
  half (its slices, block RAMs and multipliers in the other one), since the centre tile drives line k of a
  quadrant from one of them only. Past eight clocks the side buffers take the others (a board test with
  twelve clocks, feat_clocks12, on the four devices, byte-identical to ISE's bitgen). A clock LOC'd on a
  side GCLK pin still takes a top / bottom buffer through general routing, with a warning: its pad's path
  into the side buffer has database bits ISE does not set (#641). The
  global lines' reach (`clockReach`) no longer passes into general routing through the side clock tiles
  (the even lines' side buffers seemed to reach the other half).
