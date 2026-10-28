In detail:

- **A row of an array in the test bench (#1820):** C synthesis makes the arrays of two or more dimensions one memory
  only in the functions made into hardware (the top and those it names): a test bench's `main()` that passes a row of a
  two-dimensional array to the top (`sort(t[k])`) synthesizes and co-simulates again, as before #1786.
