In short:

- **ISE's timing simulation:** in an ISE mode, Simulate Post-Place & Route Model simulates ISE's model with
  its timing, the SDF netgen writes beside it (the wire and gate delays, the clock network, the setup checks).

In detail:

- **ISE's Post-Place & Route Simulation Model with its SDF (#558):** the reports name netgen's
  `<top>_timesim.sdf` beside the model, and Simulate builds its delays and setup checks into the model as it
  does the Silinx toolchain's; `parseSdf` takes the max of each min:typ:max triple (the value ISE's trce
  times), a flip-flop's asynchronous set / reset path is no longer counted with its clock to out twice, and
  ISE's setup checks of both edges of a pin are one.
