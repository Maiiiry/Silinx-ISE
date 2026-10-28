In short:

- C Simulation and C/RTL Co-simulation show their output with any Console filter: before, with the filter on
  Design, they seemed to do nothing.

In detail:

- **The Console's filter and a process started (#1852):** C Simulation's and C/RTL Co-simulation's lines are the
  Simulation filter's (they were Implementation's, hidden by Design); a process started whose lines the filter hides
  turns the filter to its source, so a button never seems to do nothing.
