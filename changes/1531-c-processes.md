In short:

- **Silinx C: the processes of a C module:** its Processes panel (both views) has C Synthesis (HLS): View/Edit C
  Source, C Simulation, C/RTL Co-simulation, View C Synthesis Report (the module, its ports, its memories, each
  loop's II and cycles) and View Generated HDL.

In detail:

- **A C module's processes (#1531):** web/js/c-source.js (`cProcesses`, `runCReport`: the report of core/c-hdl.js's
  generation in the Console, its warnings first), web/js/processes.js (the group first, in the Implementation and the
  Simulation views), web/js/i18n.js (Portuguese). Tests: test/ui/c-sim.test.js (both interfaces, Portuguese).
