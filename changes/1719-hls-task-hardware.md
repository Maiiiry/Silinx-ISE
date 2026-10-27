In short:

- **Silinx HLS: `hls::task` in hardware**: each task a process running by itself; AMD's simple_data_driven passes
  (33 of 73).

In detail:

- **hls::task in hardware (#1719):** core/c-processes.js: a task of a DATAFLOW or task region is a process whose
  `ap_start` is 1 (its machine starts again when done, its state kept across calls), its `hls_thread_local` streams
  FIFOs; the top's `ap_done` waits for its other processes only. The co-simulation waits for the values each call
  reads and writes, an input stream's values kept across calls (a task may read ahead: at least the C's values read).
