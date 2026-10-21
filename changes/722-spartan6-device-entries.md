In detail:

- **The Spartan-6 devices of the Silinx toolchain, behind a developer flag (#722, #1):** `core/fpga/s6/devices.js`:
  the parts of the Nexys3 (XC6SLX16-CSG324) and the Atlys (XC6SLX45-CSG324) with UG380's IDCODE, frame length and
  configuration size, until the measurements replace them. With `SILINX_SPARTAN6_OPEN=1` in the server's environment
  the Silinx toolchain takes them for the steps it has (the synthesis and the Post-Synthesis Simulation Model) and
  refuses the others with a message naming them; without the flag nothing changes.
