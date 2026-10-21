In short:

- **Schematic: a move or a paste that would short two named nets is refused too:** like a drawn wire, moving a
  symbol, a marker or a wire, dragging a wire segment, or pasting, so that a net named x touches a net named y,
  leaves the schematic as it was, and the status line says why.

In detail:

- **Moves and pastes that short two named nets refused (#806):** after #754 refused a drawn wire between two
  named nets, a move, a wire segment dragged or a paste could still make one net with two names ("net has several
  names" in Check Syntax). Now they are refused the same way (core/schdoc.js netShort, the schematic before and
  after): the document as it was, nothing to undo, the note "The move would short…" / "Pasting would short…".
  Tests: test/sch-netname.test.js (a wire moved, the same name moved, a paste), test/ui/sch-netname.test.js (a
  segment dragged, a marker moved, a paste, refused with the note; a move that shorts nothing still moves; both
  interfaces, English and Portuguese).
