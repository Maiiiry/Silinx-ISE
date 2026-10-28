In detail:

- **Spartan-6: the routing bits of every INT-like tile (#726):** the INT switch box in the clock-break rows, the block RAM,
  I/O, DSP and edge columns, and their own PIPs (research/s6/db/xc6slx16-int-own.json), measured with ISE
  (research/s6/gen-pipprobe6.mjs --others); their frames follow the CLB columns' rule. Every INT-like tile of the
  examples ISE implemented on the Nexys3 and the Atlys is predicted bit for bit (3106 tiles, 24 407 PIPs:
  research/s6/check-pips6.mjs). Tests: test/s6-pips.test.js.
