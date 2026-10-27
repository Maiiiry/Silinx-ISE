In short:

- **Silinx HLS: `hls::task` in the C simulation** (`hls_task.h`, `hls_thread_local`): data-driven tasks run as Vitis
  HLS's threads would.

In detail:

- **hls::task (#1721, the C simulation of #1719):** core/c-interp-task.js: `hls_thread_local hls::task t(f, a…);`
  starts a task, once, running `f` again and again while its inputs have values; the tasks run whenever the test bench
  or the top would wait (a read of an empty stream, the end of a call of the top), each invocation atomic (one that
  would read an empty stream undone: its streams, output and persistent values, and run again later); `f` of the
  form `init; while (1) body` keeps its init's variables across iterations and calls. A reference to a stream of a
  function declared before its definition is passed as the stream. Its hardware is said not made yet (#1719). AMD's
  simple_data_driven and unique_task_regions pass their C simulation.
