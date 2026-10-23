In detail:

- **Spartan-6: the placer (#729):** the packed Spartan-6 design placed on the Nexys3's XC6SLX16 and the Atlys's
  XC6SLX45 (`core/fpga/s6/`): its physical design (`phys.js`: the slices, IOBs, global buffers, block RAMs and
  DSP48A1s as site instances, every net as site pins, the constants as power nets), the device's sites
  (`sites.js`: the carry chains' next stages and the DSP cascades from the routing graph, the 32 clock-capable
  pads and their buffers, the banks), a simulated annealing in the manner of the Spartan-3E placer (`place.js`,
  `place-moves.js`: carry chains up a column of SLICEL / SLICEM, SLICEM instances on SLICEM sites, block RAMs and
  DSP48A1s on theirs, I/Os on their LOC pads with one VCCO a bank, a clock pad's buffer the one its dedicated path
  reaches), timing-driven by a simple delay estimate (`place-timing.js`, until #731), its rules checked
  (`place-check.js`) and the placement written as XDL (`xdl.js`: the sites' configurations as ISE writes them, the
  power nets from the TIEOFFs, `tieoffs.js`, or from a free LUT where no TIEOFF reaches, as ISE). Every example is
  placed legally on both parts in under a second, its wirelength per connection 0.6 to 1.2 times ISE's placement
  of the same netlists (night 1, `research/s6/compare-place.mjs`); ISE reads every placement (`xdl -xdl2ncd`),
  routes it keeping it (`par -k`) and its DRC finds no error (`research/s6/ise-place-check.sh`,
  `measured/ise-check.json`). The Spartan-6 flow has no routing nor bitstream yet (#730, #724).
