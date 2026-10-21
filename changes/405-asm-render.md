In detail:

- **mountAsmEditor split, second part: the drawing of the chart in web/js/asm-render.js (#405):** the ASM chart
  editor's drawing (the ASM blocks, the connections, the boxes with their codes and problems, the status line) and the
  toolbar's state move from mountAsmEditor to mountRender(ctx), called at the same point of the mount; no change in
  behaviour. Tests: `test/ui/asm-render.test.js`, the drawing mounted alone.
