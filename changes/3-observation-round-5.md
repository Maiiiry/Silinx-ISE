In detail:

- **Device measurements, round 5 (#3):** observation designs with every block RAM, every multiplier and 90 pads
  (`research/s3e-device/gen-obshdl.mjs`), implemented by ISE, as sources for the join tests round 4 could not drive:
  270 new tests (184 joins, 86 islands) and round 4's 716 again, every verdict agreeing with the shipped graph;
  2401 joins stay untestable. `ise-remote.sh` runs in a folder Docker Desktop shares (`RWBASE`, #482).
