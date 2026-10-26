In detail:

- **The C tests on Windows (#1577):** test/c-helpers.js declares each output of the C driver with its argument's own
  type (`bool`, `signed char`…): a pointer to another type is an error for GCC on Windows; the mismatch is now an
  error everywhere (`-Werror=incompatible-pointer-types`).
