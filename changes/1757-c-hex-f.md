In detail:

- **A hexadecimal constant ending in F in C (#1757):** `0xFFFF` was read as a float with the `f` suffix (4095);
  it is an integer, its `F`s hexadecimal digits (65535).
