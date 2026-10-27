In short:

- **Silinx HLS: a pointer to structs indexed** (`A *p; p[i].x`, `auto t = p[i];`) is an array of structs, as Vitis
  HLS takes it; two more of AMD's examples through co-simulation (30 of 73).

In detail:

- **Pointers to structs (#1684):** a pointer to structs indexed is an array of structs, its members' pointers
  indexed (core/c-pointer.js's memories, #1599): its depth the INTERFACE pragma's, a pragma naming a struct
  (`port=`, `variable=`) applying to each of its members and said once by its name; `auto t = p[i];` of a pointer
  the element's type. A pointer argument passed to a function that indexes it (inlined) is a memory too; the
  depth's warning only of the top function's.
- **Struct copies (#1685):** a struct copied as the statement of a `for`, `if`, `while`, `else` or `do` without
  braces is accepted; an index with a side effect (`b[i++] = a[3];`) is computed once, not once per member.
