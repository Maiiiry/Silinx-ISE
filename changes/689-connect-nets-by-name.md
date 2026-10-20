In short:

- **A net name already used asks first:** naming a wire with the name of another net asks whether to connect
  the two by name (one net, without a wire drawn between them, as in ISE); Cancel leaves them apart.

In detail:

- **Connecting nets by name, asked (#689):** Add Net Name, a wire's Rename net and a net name's Name, given
  a name that another net has (a net name or an I/O marker, case-insensitive in VHDL, a bus name by its
  base), ask "Connect by name" or "Cancel" (`netByName`, core/schdoc.js); Cancel adds or changes nothing.
  The rule itself is the same as before (the same names are one net, as the gates example uses it): only
  a new name no longer joins a net silently. In Portuguese too.
