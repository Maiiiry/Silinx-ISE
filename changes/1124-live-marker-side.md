In short:

- **Schematic Try it with turned or mirrored I/O markers:** their switch, clock box, LED or value is drawn on the marker,
  wherever its body is, not where the unturned marker's would be.

In detail:

- **Try it's controls by the marker's side (#1124):** core/sch-live-place.js gives a control's place from the marker's
  side (#296's ports[].side): along its body from its tip for a switch, a clock box or an LED; above a W / E body,
  beside an N / S one for a value. The unturned markers' controls are where they were (web/js/sch-live.js).
