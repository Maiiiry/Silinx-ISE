In short:

- **Stimuli saved reliably:** the stimuli drawn in ISim, clicked quickly on a slow machine, are no longer
  sometimes saved as an older version of themselves.

In detail:

- **The project's saves one at a time, in order (#593):** the project file (`silinx.json`) is saved one save
  after the other, as asked: the stimuli save at each click could reach the server in another order, an older
  project written last (the flaky UI test of ISim's stimuli in the classic interface); and the answer of an
  earlier save no longer replaces changes made while it was on its way. The UI test holds the saves before
  Fill Expected Outputs on their way and checks that Fill's is the one written.
