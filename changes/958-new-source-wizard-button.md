In short:

- **New Source: a Wizard button:** the source types have no "(Wizard)" entries any more; on the File Name and
  Location page, *Wizard | < Back | Next > | Cancel*: Next > makes the plain source, Wizard opens the type's wizard
  (Module, Schematic, Petri Net, Test Bench, the Clocking Wizard, Block Memory) with the name typed.

In detail:

- **New Source's Wizard button (#958):** Module (Wizard), Schematic (Wizard), Petri Net (Wizard), Test Bench
  (Wizard) and Clocking Wizard leave the list (the Clocking Wizard's type is now *Clock Manager (DCM / PLL)*); the
  File Name and Location page has a Wizard button before < Back, which opens the selected type's wizard with the
  file name and the location typed (the Clocking Wizard and Block Memory take the name as the module's). It is
  shown disabled for a type with no wizard (Truth Table, FSM, ASM, constraints, .mem), and Next > is disabled for
  a type that is only a wizard (Clock Manager, Block Memory). The old type ids (`modwiz`, `schwiz`, `pnwiz`,
  `tbwiz`) select the matching type. A wizard-made module still reopens its wizard from the Design pane. The
  wizard driver takes an extra button and a page's `noNext`. UI tests: `test/ui/new-source.test.js` (modern,
  classic, Tasks, Portuguese) and every wizard's test through the button.
