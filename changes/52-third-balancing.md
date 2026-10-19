In short:

- **Faster deep logic:** the Silinx toolchain's synthesis balances the logic of a design limited by its depth
  once more, and keeps that circuit when it is better (the EPFL priority benchmark 19 % faster).

In detail:

- **Logic depth: a third candidate, balanced twice more (#52):** a design whose depth-oriented mapping is kept
  is also mapped with ABC's SOP balancing four times (with the LUT delays), kept as the two balanced once more
  are; routed, EPFL priority 11.20 -> 9.08 ns, EPFL max 29.0 -> 28.1 ns (fewer LUTs and slices), the pedestrian
  crossing at High 8.61 -> 8.16 ns; the other designs as before.
