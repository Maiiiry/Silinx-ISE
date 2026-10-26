In short:

- A design module simulated with no test bench opens SSim's wave window with its inputs and outputs only, in their order; add its internal signals from the Objects panel (Add to Wave Window).

In detail:

- **The wave window of a module simulated with no test bench: its ports (#1519):** Simulate Behavioral Model of a design module, Tasks ▸ Simulate's module and a module simulated with stimuli drawn in SSim put the module's inputs and outputs in the wave window, in the port order, not every signal of the module; the others are added from the Objects and Instances panes. A test bench (no ports) keeps its top-level signals, as ISE adds them, and a saved wave configuration (.wcfg) restores what it saved.
