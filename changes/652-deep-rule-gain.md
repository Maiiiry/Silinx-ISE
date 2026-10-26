In short:

- **Faster deep designs at Optimization Effort Normal with the Silinx toolchain:** a design limited by its logic depth
  keeps High's netlist when it is 10 % faster (was 25 %): ITC'99 b05 13 % faster, b14 5 %, by ISE's timing analyser.

In detail:

- **Normal keeps High's mappings of a deep design when 10 % faster (#652):** a design of more than 16 levels of logic
  (`DEEP_RULE`) gets High's mappings at Normal too, kept since #611 only when 25 % faster by the estimate than Normal's
  own netlist (then ITC'99 b05 and b14 gained 9 and 15 % for 5 and 9 % more slices). They now gain 23 and 13 % with
  fewer LUTs (282 against 295, 987 against 1059), and `DEEP_RULE.gain` is 10 %: by ISE's trce at Normal itc99-b05
  11.875 → 10.343 ns (−12.9 %, 1.21 → 1.05 times ISE's critical path) and itc99-b14 33.903 → 32.257 ns (−4.9 %),
  slices 246 → 255 and 663 → 657, both bitstreams byte-identical to ISE's bitgen with a clean DRC; no other design of
  the corpus or the examples is deep at Normal, nothing else changes, and no synthesis takes longer (both netlists were
  made before). The console's note, when High's netlist is not kept, names the rule's gain ("not 10 % faster").
