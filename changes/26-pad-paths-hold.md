In short:

- **Silinx toolchain's timing report: the pads' paths and OFFSET constraints:** the report now lists each input's
  pad to setup, each output's clock to pad, the paths from pad to pad and a hold check, as trce's data sheet report
  does, and checks the UCF's `OFFSET = IN … BEFORE` / `OFFSET = OUT … AFTER` constraints (estimates until fitted
  to ISE's timing analyzer).

In detail:

- **Static timing: the pads' paths, the hold check and the OFFSET constraints (#26):** `timingGraph().pads()` and
  `analyzeTiming().pads`: an input pad to the setups of each clock's flip-flops less the clock's arrival there (pad to
  setup, what OFFSET IN bounds), the clock's pad through a flip-flop to an output pad (clock to pad, OFFSET OUT), input
  pad to output pad through logic only, and the shortest flip-flop to flip-flop path of each clock (hold, no clock skew
  counted). `clockArrivals`: the clock's pad, the routed nets on the way and the global buffer to each clock pin.
  `parseOffsets` / `checkOffsets`: `OFFSET = IN | OUT n ns BEFORE | AFTER "clk"` on all pads or on a NET (a TIMEGRP's
  is said not analyzed); in timing.txt, the flow's warnings and its report's constraints. The period, the placer and
  the router are unchanged. Estimates (`SPEED_4.clock`): the global buffer's delay, the hold times (0), and the clock
  nets' wires, which the wire fit left out; trce's values of these are still to be measured. An output pad's path ends
  on its O1 pin (was O); an output through its IOB register (#96) has no clock to pad yet, and the IOB registers'
  clocks (ICLK1, OTCLK1) get their arrivals too.
