In short:

- **Silinx HLS C++:** member functions, constructors and `operator()` of structs, classes and class templates
  (defined in the class or outside it).

In detail:

- **Methods and constructors (#1590):** core/cpp-method.js: a method a function of its struct taking it by
  reference (its members, its calls of the other methods), defined in the class or outside it; constructors with
  their initializer lists, called where the object is declared; a default constructor of constants its members'
  initial values (a static object starts with them); `operator()`; destructors nothing. A class template with data
  members a struct per instance. Virtual functions, other operators, static member functions of such a class,
  methods declared but not defined, constructors of another number of arguments: said.
