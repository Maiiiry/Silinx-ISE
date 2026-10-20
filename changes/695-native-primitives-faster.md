In short:

- **Board Emulator, a simulation model on the event-driven engine, 3 to 5 times faster:** blinky's post-map model
  runs about 84 000 cycles a second (was 16 000) and pong's about 25 000 (was 6 000), with the same results.

In detail:

- **Native primitives with a fixed sensitivity (#695):** the netlist primitives evaluated in JavaScript
  (core/native.js) no longer run as generators that allocate a waiter at every wake. Each has one waiter, kept in its
  inputs' waiter sets (core/simulator.js). Their inputs' bits are compared, not masked (a BigInt `&` allocates). A
  whole write of a value of the signal's width and sign stores that value itself instead of a copy, so the
  primitives' shared 0 and 1 reach their inputs (core/interp.js). blinky's models now run 123k / 85k / 83k cycles a
  second (post-synthesis / post-translate / post-map, was 31k / 17k / 16k) and pong's 33k / 28k / 25k (was
  10k / 6k / 5.9k), with the same outputs cycle by cycle. The behavioural design's speed is unchanged.
- **A reset of a netlist's simulation (#698):** the native primitives kept the previous run's state: their outputs'
  values projected under the old run's delta stamps, and a shift register's or a distributed RAM's contents. After
  `Simulator.reset()` (the Board Emulator's Power cycle) a counter could stand still. They now start again from
  their initial state.
