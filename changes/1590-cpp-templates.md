In short:

- **Silinx HLS C++:** templates (function and class, integer and type parameters, specializations), classes of
  static members, `auto`, the range `for`, `<iomanip>`'s `setw` / `hex` in test benches, `#pragma HLS if (…)` and
  macros in pragmas. Three more of AMD's examples go through every stage (13 of 73).

In detail:

- **C++ templates (#1590):** core/cpp-template.js: an instance per list of arguments, named by them (`f<1, 4>` is
  `f_1_4`, a name legal in VHDL and none of the source's), defaults, explicit specializations, a type parameter
  deduced from the call, member templates; classes of static members (their functions, constants and types named by
  the class); a pragma's value a parameter's, `#pragma HLS if (cond)` kept when cond holds; what is not supported said
  once (a parameter not given or not constant, a template declared but not defined, instances too deep).
- **auto and the range for (#1590):** core/cpp-sugar.js: `auto x = e;` takes the type e is declared with (a call's
  return type, a literal's int); `for (T x : a)` / `for (T &x : a)` over an array a loop on its index; over an array
  argument refused, as C++.
- **cout's manipulators and strings (#1590):** `setw`, `left` / `right`, `setfill('0')`, `hex` / `oct` / `dec`,
  `setbase`; `fixed`, `setprecision` ignored; a string chosen by `?:`.
- **Macros in pragmas (#1590):** expanded, as Vitis HLS does (`factor=N`, `if (OPT == 3)`), in C and C++.
- docs/c-to-hdl.md: a C++ section.
