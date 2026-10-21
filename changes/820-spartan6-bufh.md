In short:

- **The Design Summary of every Spartan-6 part:** before an implementation it shows the part's horizontal clock buffers
  (BUFH), not only on the Nexys3's and the Atlys's parts.

In detail:

- **The BUFH of every Spartan-6 part (#820):** the device resources model (core/resources.js) has the count of every
  part (128 on the LX4 / LX9 / LX16, 160 on the LX25(T), 256 on the LX45(T), 384 on the LX75(T)), measured with ISE's
  device report (`xdl -report`), which also confirms 16 BUFGMUX and 32 BUFIO2 on every part and the model's other
  counts; the test has those reports as its reference.
