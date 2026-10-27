In short:

- **Silinx HLS: pointer arithmetic and local pointers** as Vitis HLS takes them: `*(p + i)`, a pointer argument
  indexed (a memory), a local pointer set to an array, a variable or an element and moved.

In detail:

- **Pointers (#1599):** core/c-pointer.js: `*(p + e)`, `*(e + p)`, `*(p - e)` are `p[e]`; a pointer argument of a
  synthesized function indexed is an array, `ap_memory`, its depth the INTERFACE pragma's `depth=` (else 1024, a
  warning); a local pointer set to arrays or variables of its own type (`a`, `&x`, `&a[i]`, `a + i`) and moved
  (`p += n`, `p++`) is a register of its target (when it has several: their elements multiplexed, read only) and
  one of its offset. A cast of a pointer to another type, a pointer passed on or compared, said. The co-simulation
  compares the elements the C's array has (a pointer argument's memory may be deeper). A C name starting or ending
  with '_' or with '__' a legal VHDL name in the module (`ap_r_u0_x`). Four more of AMD's examples through
  co-simulation (28 of 73).
