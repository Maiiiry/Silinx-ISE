In detail:

- **Design corpus: the expectations as main makes them (#537):** the Nightly's designs job failed on itc99-b20 and
  itc99-b21, 8.6 % and 12.3 % more slices. That was not a merge of that night: since #502 (the shift-register map's
  text, which changes the netlist ABC gets even without shift registers), the synthesis keeps the faster mapping
  with the wider functions for them (-9 % critical path), and the expectations had not been recorded for every
  design since. Recorded from a Nightly on main with #554 (run 39199525373): 58 designs' size and speed (most
  smaller or faster: the packer's #527 / #528, the synthesis's #511 / #514 / #523), secworks-aes on the XC3S500E
  instead of the XC3S1200E; no stage, no warning changed otherwise.
