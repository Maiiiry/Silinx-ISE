In short:

- **Schematic: Rename… on a right-click:** a symbol, an I/O marker or a net name is renamed from its right-click
  menu; a name that is not valid, a reserved word or already taken is refused with a message.

In detail:

- **The schematic editor's right-click menu: Rename… (#1546):** a right-click on a symbol, an I/O marker or a net name
  selects it and offers Rename…, a small dialog with its name (`web/js/sch-rename.js`). The name must be an identifier
  of VHDL and Verilog, not a reserved word of either, and not the name of another instance or I/O marker
  (`core/schname.js`); a refused name is said in the dialog, which stays open. A net name is renamed with its whole
  net, as in the Properties panel (#734). The rename is one undo step and the generated HDL follows it.
