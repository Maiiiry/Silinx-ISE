In short:

- **Faster writes of one bit chosen by an index:** `x[i] <= c ? v : x[i]` (in VHDL `x(i) <= v when c else x(i)`,
  or an `if` whose `else` writes `x(i) <= x(i)`) is now synthesized as the write `if (c) x[i] <= v`, without reading
  the whole vector to write the same bit back. The design corpus's iwls05-spi is 23 % faster (17.6 ns to 13.6, ISE
  13.0) and 11 % smaller in slices.

In detail:

- **An element written back with its own value as a conditional write (#523):** the synthesis front end
  (`core/synth-verilog.js`) wrote `x[i] <= c ? v : x[i]` as it is, and the read of `x[i]` is a multiplexer of the
  whole vector, only to write the same bit back (iwls05-spi's `data[rx_bit_pos] <= rx_clk ? s_in : data[rx_bit_pos]`,
  a 128:1 multiplexer on its critical path). Now such an assignment (either side the element itself, `sameExpr`:
  the same signals, operators and constants, no calls) is written `if (c) x[i] <= v` (`if (!(c))` for the other
  side), and `x[i] <= x[i]` not at all; VHDL's `when … else` and `if … else` give the same. A nonblocking
  assignment only when no other assignment to the same signal can precede it in its process (`markFirstWrites`;
  there `x[i]` keeps that earlier value): otherwise as before. Measured with ISE's trce on the routed design
  (Normal, XC3S1200E): 17.57 ns to 13.57 (ISE 13.04), 745 LUTs to 672 (ISE 717), 397 slices to 355 (ISE 430).
  Tests: `test/synth-open.test.js` (in Verilog and in VHDL: the conditional writes written, the ones after a
  write to the vector and through a function as before, 82 and 80 LUTs to 71, no warnings, the netlists against
  the RTL).
