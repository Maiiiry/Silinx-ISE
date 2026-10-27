In short:

- **Convert to Schematic:** a Verilog module with `` `ifdef `` / `` `else `` inside it is converted, its statements
  as the compiler reads them.

In detail:

- **Convert to Schematic: compiler directives inside a module (#1716):** the module's text is read as the compiler
  reads it (`activeVerilog`, core/schdoc-source.js): the `` `ifdef `` / `` `ifndef `` / `` `elsif `` / `` `else ``
  branches not taken and the directive lines left out, the macros defined in the file and in the files it includes
  deciding; an HDL block no longer keeps an `` `endif `` without its `` `ifdef `` (an always block whose header is
  chosen by `` `ifdef ``), and a statement whose branch was not taken no longer starts the next one.
