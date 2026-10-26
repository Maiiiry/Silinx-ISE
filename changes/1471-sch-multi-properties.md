In short:

- The schematic editor's Properties panel works on several objects selected: it shows what they have in common
  (the direction or width of I/O markers, the width of gates, "Draw as bus" of wires) and sets it for all of them
  at once.

In detail:

- **Several objects' common properties in the schematic editor (#1471):** with several objects selected, the
  Properties panel shows, under "N objects selected", the fields every one of them has, with the same kind and
  choices: an I/O marker's Direction, Width and HDL type, a wire's "Draw as bus", a symbol's parameters (the width
  of gates of any kind, a flip-flop's INIT...). A field whose value differs between them shows "(mixed)" and is
  left as it is until a value is given; a value set applies to all of them in one edit (one undo step). What must
  stay unique per object (an instance name, a marker's or a net's name) and what changes a symbol's type (a gate's
  inputs) are left out. `core/schmulti.js` (new) finds the fields and applies them; `web/js/sch-multi.js` (new) draws
  them in the panel. `test/schmulti.test.js` (new) and `test/ui/sch-props.test.js` check them, in Portuguese too.
