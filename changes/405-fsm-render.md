In detail:

- **mountFsmEditor split, second part: the drawing of the diagram in web/js/fsm-render.js (#405):** the FSM editor's
  geometry of a transition and its drawing of the states and transitions (codes, labels, selection, problems, the
  simulation) move from mountFsmEditor to mountRender(ctx), called at the same point of the mount; no change in
  behaviour. Tests: `test/ui/fsm-render.test.js`, the drawing mounted alone.
