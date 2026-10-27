In short:

- **Silinx HLS: `hls::split` and `hls::merge`** (`hls_np_channel.h`) in DATAFLOW regions; AMD's four merge / split
  examples pass (42 of 73).

In detail:

- **Split and merge channels (#1743, step 3 of #1706):** core/cpp-np-channel.js: `hls::split::round_robin<T, N, D>` and
  `hls::merge::round_robin<T, N, D>` are FIFOs (`s.in`, `s.out[i]`; `m.in[i]`, `m.out`) and a task of their own
  defined before the function, moving each value to its outputs in turn (a split) or from its inputs in turn (a
  merge); `load_balance` is made as round_robin, with a warning.
