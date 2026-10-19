In detail:

- **Silinx toolchain, XC3S1200E: the long-line splitters (#23):** the router may join a vertical long line's two
  halves across the centre row (CLKH_LL) where that is faster, and bitgen writes the splitter's bit of the right
  direction: a routed design names it `a =- b`, and `pipFeatures` now takes the half of the line the net drives (a
  PIP in any tile, or the net's output pin) from the device description as its input. The placer's delay table
  leaves the splitters out (`knownRouting` `delayPip`): counted there, they made the placements slower. The other
  devices are unchanged. The XC3S1200E's other splitters are left for #709.
