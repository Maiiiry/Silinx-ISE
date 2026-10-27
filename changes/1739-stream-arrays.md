In short:

- **Silinx HLS: arrays of `hls::stream`** (each element a stream of its own); two more of AMD's examples pass
  (38 of 73).

In detail:

- **Arrays of streams (#1739):** core/c-stream-array.js: `hls::stream<T> s[N]` (a declaration, a parameter `s[N]` or
  `(&s)[N]`) is N streams `s_0`…, each its own ap_fifo port or a FIFO of a DATAFLOW region; `s[k]` by a constant that
  stream, `s[i]` by a variable the statement for each element (an `if` on the index, a declaration's variable
  declared first); the array passed whole its elements; a pragma naming it each element's, said once; a stream's
  name (`hls::stream<T> s("in")`) dropped. AMD's using_array_of_streams and free_running_kernel_remerge_ii4to1 pass.
