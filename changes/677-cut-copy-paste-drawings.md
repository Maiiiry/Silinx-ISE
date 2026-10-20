In short:

- **Cut, Copy, Paste in the state machine and Petri net editors:** the ASM chart's boxes, the FSM diagram's
  states and the Petri net's places and transitions are copied and pasted too (Edit menu, toolbar, Ctrl+X, C,
  V), with new names, also into another drawing.

In detail:

- **The ASM, FSM and Petri net editors' Cut / Copy / Paste (#677, core/drawclip.js):** the nodes selected and
  the connections between them (ASM connections, FSM transitions and self-loops, Petri arcs), pasted offset and
  selected, a name already used made new (_1, _2…); pasted into an empty drawing, the copy's initial state
  becomes its. Edit ▸ Delete deletes the selection, a transition or an arc included.
- **Edit ▸ Cut / Copy / Paste / Delete in a text field (#677):** with a field of an editor in focus (a name, an
  expression, a property, the truth table's or the pin planner's), the menu and the toolbar act on its selected
  text, not on the drawing; the toolbar's buttons leave the focus where it was.
