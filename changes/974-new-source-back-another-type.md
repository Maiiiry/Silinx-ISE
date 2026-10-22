In short:

- **New Source, < Back and another type:** after going back and choosing another source type, the wizard's steps,
  its Next > / Finish button and the File Name page follow the new type, not the first one.

In detail:

- **New Source follows the type selected last (#974):** the wizard driver takes its pages as a function and draws
  the steps on the side and the buttons from the pages now on every render, with a `refresh` that New Source's
  type list calls on a click (it replaces a Proxy that faked a fixed page list and a hand-patched button label);
  the File Name and Location page shows the type now. A UI test (modern and classic) walks every ordered pair of
  types (Next >, < Back, the other type, Next >), every page of the last type forward and back to the source it
  makes, Cancel and New Source again, and Wizard after a change of type.
