In short:

- **Silinx HLS: structs and enums** in C and C++. Members, nested structs, arrays of structs, copies, initializer
  lists, structs passed to and returned by functions; `enum` and `enum class`; C++'s `int(x)` casts. Three more of
  AMD's examples go through every stage (16 of 73).

In detail:

- **Structs (#1590):** core/c-struct.js: a struct disaggregated as Vitis HLS does inside the code: a variable per
  member (`p.x` is `p_x`), an array of structs an array per member, a member array of an array of structs one array
  of both sizes; copies member by member; `{ … }` nested or not; members' defaults; passed by value, by reference or
  by address, arrays of structs whole; returned through parameters added for it. The top function's struct
  arguments and result: a port per member, with a warning (Vitis HLS aggregates them, #1628). Unions, pointers in a
  struct, bit fields, pointer variables to structs: said.
- **Enums (#1590):** their constants constants (from other enums' too), their type an int; `enum class`.
- **C++ (#1590):** `int(x)` (a functional cast) is `(int)(x)`; `main(int, char **)` with unnamed parameters.
