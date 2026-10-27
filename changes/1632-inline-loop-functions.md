In short:

- **Silinx HLS:** a function with a loop, or given an array (a memory too), can be called by the top function (a
  filter's `operator()`, a read / compute / write split). One more of AMD's examples goes through every stage (17 of
  73).

In detail:

- **Calls inlined (#1632):** core/c-inline.js: a sequential top function's calls of a function with a loop, or given
  an array, inlined into its body before its state machine is made: its by-value parameters local variables, its
  pointer, reference and array parameters the arguments (a memory passed to a function no longer refused), its
  statics one register per function shared by every call, its early returns (in nested loops too) through a flag, a
  call inside an expression made before it; a call in a loop's condition or after `&&`, `||`, `?:` and a return in
  a `switch` said.
