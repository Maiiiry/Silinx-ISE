In short:

- **Silinx HLS:** a pointer argument read and written named as a reserved word (out, in) makes a module that compiles.

In detail:

- **A read-write pointer named as a reserved word (#1622):** the module read `out_i` while its port was `out_r_i`;
  the input now takes its argument's name as the other ports do, combinational and sequential.
