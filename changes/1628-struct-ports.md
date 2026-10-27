In short:

- **Silinx HLS: a struct argument or result of the top function is one port**, as Vitis HLS makes it (its members
  packed, the first at the LSB).

In detail:

- **Struct ports (#1628):** core/c-aggregate.js: a struct argument or result of the top function aggregated into one
  port as Vitis HLS does (UG1399, the Vivado IP flow): its members in their order from the LSB, each its C size (bool
  and char 8 bits, an `ap_int<W>` a power of 2 of bytes), the padding bits 0. Read, an input `s`; written, `s_i`,
  `s_o` and `s_o_ap_vld` (a sequential module reads all its members at the start of a call, those not written given
  back as they were); returned, `ap_return`. The members' ports are signals inside the module (`ap_s_…`); the
  co-simulation packs the C's values the same way. A struct named as a reserved word is said (`in_r`). A stream or
  an array of structs keeps a stream or a memory per member, its warning now #1668.
