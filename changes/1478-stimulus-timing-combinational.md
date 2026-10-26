In short:

- Stimulus Timing: with no clock (combinational), only the Clock is asked; the stimuli get one cycle for each
  combination of the inputs.

In detail:

- **Stimulus Timing with Clock None (combinational) (#1478):** Clock Period, Time Step and Cycles are hidden with
  their labels while no clock is chosen, live as the Clock changes, and shown again when one is. Without a clock the
  stimuli keep the saved time step (10 ns for new ones) and get as many cycles as the combinations of the input bits
  (`combinationCycles` in `core/stimuli.js`: 2^bits, 1 with no input, at most 1024), or keep their cycles when they
  were already combinational; the dialog's text no longer names the time step.
