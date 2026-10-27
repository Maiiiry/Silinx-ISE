In detail:

- **A call inlined: the callee's locals named apart (#1637):** a local of the callee named as the variable the caller
  passes by address (a struct returned, `S m = f(…)` with its own `m` inside) no longer hides it.
