In detail:

- **The Tasks interface: no tab bar in Simulate, Emulate and Program (#854):** ISim, the board emulator and iMPACT
  are one document each (a new one replaces the old), so the task's tab bar only repeated their name. There
  it is gone; the document's module and model (Behavioral, Behavioral (RTL), Post-Synthesis…) and its Close
  are in the task's bar. Edit and Implement keep their tabs.
- **A document closed brings no other task to the front:** the document that comes forward in its place,
  of another task, leaves the task where it was, with its page.
