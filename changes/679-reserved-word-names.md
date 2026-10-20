In short:

- **Reserved words refused as names:** a new source, a module, a port, an I/O marker, a net or an instance can no
  longer be named with a reserved word of VHDL or Verilog (AND, OR, BEGIN, MODULE, wire, signal…, in any letter
  case): the message names the word and the language. A project that already has such a module is warned when it
  is opened and at Check Syntax.

In detail:

- **One list of the reserved words of VHDL and Verilog (#679):** `core/reserved.js` holds the words of VHDL-93 /
  2008, Verilog-2005 and SystemVerilog-2017, used by the New Source wizard (and its Module, Schematic, Petri net
  and Test Bench wizards), Rename, Add Copy of Source (a drawing so named is refused), the truth table's and the
  schematic editor's names, Rename Symbol, and the checks of the schematics, FSMs, ASM charts, Petri nets and
  truth tables (several copies of the list, which differed, are gone). A new name is refused in any letter case
  and in both languages, as a drawing's HDL is generated in either; an existing name is an error of its drawing
  when its HDL would not compile (a schematic named AND now says so instead of failing in the compiler), else a
  warning (a word of VHDL or Verilog; SystemVerilog's own words, good names for XST and Yosys, only refused for
  a new name); a module so named is warned of when the project is opened and at Check Syntax.
