In short:

- **Dragging a wire segment moves only that segment:** a horizontal one up or down, a vertical one left or
  right; the segments next to it stretch to stay attached and the rest of the wire stays where it is. An end
  segment keeps its pin connected, with a short segment added.

In detail:

- **One wire segment dragged (#688):** with Keep connections, dragging a wire moves the segment under the
  pointer across its direction (`moveSegment`, core/schroute.js); its two neighbours stretch or shrink, a
  neighbour shrunk to nothing is merged away; the wire's end on a pin, a marker or another wire stays, joined
  by a new short segment (a free end moves with the segment); the net names on the segment go with it, one
  on a neighbour that shrank past it is put back on the wire. The nets and the generated HDL do not change.
  Without Keep connections the wire still moves whole; a part dragged still drags its wires' ends.
