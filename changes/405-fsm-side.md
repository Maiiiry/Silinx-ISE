In detail:

- **mountFsmEditor split, first part: the side panel in web/js/fsm-side.js (#405):** the FSM editor's side panel (the
  selected state's or transition's properties and the machine's) moves from mountFsmEditor to mountSide(ctx), called
  at the same point of the mount; no change in behaviour. Tests: `test/ui/fsm-side.test.js`, the panel mounted alone.
