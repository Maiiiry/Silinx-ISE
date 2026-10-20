In short:

- **Faster small control designs with the Silinx toolchain:** the synthesis maps the critical path once more for
  speed and, where it ends on a flip-flop's clock enable, puts that enable in the logic before the flip-flop, as XST
  does: about 3 % shorter critical paths on average at Optimization Effort Normal (up to 22 % on small state
  machines and counters), with no more slices; the synthesis takes 0.3 to 1 s longer.

In detail:

- **The critical path mapped again, its clock enables folded into D (#653, #652):** two candidates after every other
  mapping, at both efforts (designs of 1500 LUTs at most), each from the netlist before the LUT mapping and kept by
  `DEPTH_RULE` against the netlist chosen: ABC's `speedup` after the usual mapping (`SPEED_ABC`: the critical path's
  LUTs remapped with their timing-critical cuts as choices), then the flip-flops whose CE ends the critical path
  (`criticalEnables`, from the estimate's path ends, `pathEnds`) with their enable a multiplexer before D and CE tied
  high (`FOLD_CE_MAP`, every FDRE / FDSE / FDCE / FDPE and its falling-edge form), so that the enable's last LUT and the
  hold share one LUT and the path does not pay the CE's setup (Tceck 0.555 ns). Recorded in the synthesis's
  `depth.speed` and `depth.fold`; a remap that fails keeps the netlist chosen, with a warning. By ISE's trce on the
  corpus's 53 designs of 1500 LUTs at most and the examples: at Normal 24 change, 6.1 % shorter on average (itc99-b09
  −22 %, serv −21 %, itc99-b08 −15 %, iwls05-i2c and usb-phy −12 %, the traffic example −12 %; light8080 +2.9 %, the
  clock example +4.2 %), 2.8 % over the 53; at High 7 change, 0.7 % over the 53; slices 10029 → 10015 (Normal) and
  9942 → 9904 (High); every bitstream byte-identical to ISE's bitgen with a clean DRC. The level more of
  spi-fpga-slave (#652) is found by the speedup but duplicates its shared enable (21 LUTs → 33): refused, still open
  (research/synth-quality/README.md, "The short control paths").
