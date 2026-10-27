In short:

- **Silinx HLS:** a function the top function calls may have static variables and locals passed to other functions
  (they were "not declared" in the C synthesis).

In detail:

- **The statics of the functions the top calls (#1618):** a register each, shared by every call of the function (as
  C's), its initial value at the reset; the other locals of a function called from a sequential top are values inside
  the state that runs it.
