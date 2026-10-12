# Changelog

What changed in each version of Silinx ISE. The newest version is first. Each section is also
the "What's new" text of its GitHub release.

## 15.10.3

- **The synthesis tool is a setting of the project** (New Project Wizard and Design Properties:
  *Silinx*, no ISE needed, or *XST*, Xilinx ISE): new projects use Silinx. A project's processes
  and its Implement Design follow it, whatever the execution mode of Toolchain Settings (XST runs
  with the ISE set there); a project from before the setting follows Toolchain Settings.
- **Open synthesis: constant function calls** of a function that reads no signal (verilog-lfsr's
  `lfsr_mask(n)` in a generate loop) are evaluated by the translator, their values literals: the
  CRC-32 synthesizes in 2.4 s (was 160 s) and the PRBS31 in 1.7 s (was 110 s), with the same cells
  and without the ~160 `Replacing memory … with list of registers` warnings each (#13).
- **Open synthesis: start values as in simulation.** A VHDL integer signal with no initial value
  starts at `T'left` (1 for `range 1 to 10`), a `bit` at `'0'`, and an output port at its default
  value (`q : out std_logic := '1'`) in the netlist too: they powered up at 0 there (#60).
- **VHDL testbenches: light8080's own testbench runs and passes.** Subprograms of one name from a
  package and from a use clause are overloads of each other (a package's `hstr(unsigned)` hid
  `txt_util`'s `hstr(std_logic_vector)` and called itself without end); string slices
  (`buf(1 to n)`), `'high` / `'low` of strings, string aggregates (`(others => ' ')`), and string
  signals, which kept their initial value whatever was assigned to them; a character literal picks a
  `character` overload, `std_logic_vector(u)` and `std_logic_vector'(…)` a `std_logic_vector` one
  (#72).
- **Simulator: errors, not crashes:** a function calling itself without end is a simulation error
  (`recursion too deep in function f`), and so is a scheduled assignment that does not fit its target;
  both stopped the simulator with an internal error (#73).
- **SystemVerilog packages:** `package … endpackage` with parameters, typedefs, enumerations and
  functions, in its own file or with the design; `import p::*;` in the compilation unit, a module's
  header or body, or another package; scoped names (`p::W`, `p::word_t`, `p::f(x)`). Simulated and
  synthesized by the open synthesis (#6).
- **More SystemVerilog** (#6): `return` statements; a function's `output` arguments when it is
  called in an expression (they were not assigned); `$floor`, `$ceil`, `$sqrt`… of values known at
  run time; an instance's parameter by its hierarchical name (`u.P`); `rand` / `randc` / `const`
  qualifiers; packed unions; enumeration name ranges (`S[3]`, `T[5:7] = 20`).
- **Silinx toolchain: clocks on block RAMs and multipliers.** A clock's block RAMs and
  multipliers go only on the sites whose clock pins its global buffer's lines reach on switches of
  known bits, as its flip-flops already did. A clock on the bottom GCLK pin (N9 on the FG320, M4 on
  the CP132), whose buffer BUFGMUX_X2Y1 reaches none of them yet, takes BUFGMUX_X2Y11 through
  general routing, with a warning that says so; it kept BUFGMUX_X2Y1 and the block RAM's clock could
  not be routed (#56).
- **Silinx toolchain: a clock with no LOC that drives a DCM** goes on a pad whose dedicated path of
  known bits reaches the DCM's CLKIN (B8 on the XC3S250E and XC3S500E), as one that drives a global
  buffer does since #49; it took any free pad (#57).
- **Silinx toolchain: a clock LOC'd on a GCLK pin** takes the global buffer its dedicated path
  reaches. On a side GCLK pin (K3 on the FG320, G3 on the CP132) those are the side buffers, whose
  settings are not in the bit database yet (#45): a top or bottom buffer, through general routing as
  before, now with a warning that says why (#58).
- **Design corpus:** NEORV32 and light8080 now go through the whole open flow (synthesis, the
  netlist compared with the RTL cycle by cycle, place and route); light8080's, secworks-sha1's and
  secworks-aes's own testbenches pass. Every design of the corpus synthesizes and builds.

## 15.10.2

In short:

- **No Xilinx tool needed for the Basys2 and Nexys2:** the *Silinx toolchain* is the default mode of a
  new installation and builds bitstreams for the Basys2-100 / 250 and the Nexys2-500 / 1200 by
  itself (synthesis, place and route, bitstream), byte-identical to ISE's bitgen on the tested
  designs, with block RAMs, multipliers, distributed RAM, shift registers and DCMs.
- **Two more examples**, *pong* (a game for two) and *stopwatch*, besides *blinky*: each runs on all
  four boards' chips and builds with no warning, with the Silinx toolchain and with ISE.
- **How it compares with ISE** ([docs/QUALITY.md](docs/QUALITY.md)): on open-source designs, the
  Silinx toolchain's circuits are smaller than ISE's (23% fewer LUTs) and about 15% slower; XST
  cannot read 11 of those designs.
- **More VHDL and Verilog:** records, slices of arrays, file objects, null ranges, Xilinx primitives
  from Verilog, hierarchical names in testbenches, and design checks closer to XST's.
- Many fixes, each tracked as a GitHub issue (https://github.com/pmnmalo/Silinx-ISE/issues).

In detail:

- **Silinx toolchain: a clock with no pin location** could fail in Place & Route (a design with no
  UCF: its clock could not reach a block RAM on the switches of known bits). A clock input with no
  `LOC` is now put on a free GCLK pin, a pad whose dedicated path reaches a global clock buffer (B8
  -> BUFGMUX_X2Y11 on every Spartan-3E device of the toolchain), as ISE places a clock (#49).
- **Escaped port names in the UCF** (Verilog `\opcode[0] `, as in the EPFL benchmarks): XST names
  such a port `_opcode[0]_` in its netlist (between underscores, with `. + / \ ~ ^ * = % & $` turned
  into `_`; a plain name's `$` too: `b$c` is `b_c`), the only spelling ngdbuild finds (measured with
  ISE 14.7). The automatic pins of the ISE modes, I/O Pin Planning, the board's pin assignment and
  the Silinx toolchain's pads now use it, and Check Constraints accepts it — and reports the HDL
  name (`NET "opcode[0]"`) as the error ngdbuild gives (ConstraintSystem:59), with the right name.
  The EPFL designs epfl-ctrl, epfl-cavlc and epfl-int2float now build with ISE to a bitstream (#34).
- **Silinx toolchain: an input pad that drives nothing** is written as ISE's bitgen writes it: the
  pad without its input, whatever its I/O standard (3 bits per pad differed). Measured on every pad
  of the four Spartan-3E devices (`I:NOLOAD` in the pads' bit database). The open flow leaves such
  inputs out, as ISE's map does; the corpus designs that differed (verilog-lfsr-prbs,
  spi-fpga-master, verilog-axis-fifo) are byte-identical to ISE's bitgen (#18).
- **Silinx toolchain: multiplications by a constant** (such as the stopwatch example's x * 6554)
  failed in Place & Route on every Spartan-3E device: the multiplier's inputs tied to 1 could not
  be routed on the switches of known bits. Each is now tied, as ISE does, to the constant-1 source
  of the block-RAM interconnect tile its pin comes from (#35). A block-RAM word with a bit in a
  parity position that its port writes but does not read (a 14-bit memory) is laid out on the data
  bits instead, as ISE's map does: ISE's design rule check warned about it.
- **The Silinx toolchain for the other Spartan-3E boards:** the Basys2-100 (XC3S100E), the Nexys2-500
  (XC3S500E) and the Nexys2-1200 (XC3S1200E) have their bit databases, measured as the
  Basys2-250's was: Implement Design and Generate Programming File work for them with no Xilinx
  tool. blinky and lab11 on each are byte-identical to ISE's bitgen, with no DRC error or warning.
  The pads are measured for the boards' packages, every I/O standard, drive, slew and pull of every
  pad (CP132 and FG320): the Spartan-3E Starter Kit's settings (LVTTL, drive 8 and 4, fast and slow
  slew, pull-ups and pull-downs) work in the open toolchain too, byte-identical to ISE's bitgen.
  The tile types' bits are shared by the four devices (`research/s3e-bitstream/db`: one
  file of tile types, the layout, LUTs, block RAMs and pads per device), read by one loader.
- **All the DCMs measured:** the settings of every DCM of the four devices (the XC3S1200E's eight
  too), their pins' routing, any input period (`CLKIN_PERIOD`: the DCM's frequency ranges, as ISE
  computes them), and `STARTUP_WAIT` (the configuration waits for the DCM's lock), which the open
  toolchain now accepts. Designs of every DCM of each device implemented by ISE give the same .bit
  with Silinx's writer (but for the side global buffers' clock tiles, not measured yet, and the
  XC3S1200E's long-line splitters).
  Fixed on the way: a DCM's clock outputs CLK0, CLK2X and CLKDV had their enable bits set whether
  they were used or not (each output used has its own bit).
- More of the XC3S250E (and the others) measured: the DCMs' pins, the inputs and the select of
  every global clock buffer (BUFGMUX) of the top and bottom; a placement where the DCM outputs
  could not all get a global buffer is found now.
- **The rest of the Spartan-3E in the Silinx toolchain:** block RAMs (inferred by the open synthesis
  or instantiated: `RAMB16_S*` / `RAMB16_S*_S*`, every port width and write mode, `INIT_xx`,
  `INIT` / `SRVAL`), multipliers (`MULT18X18`, `MULT18X18S`, `MULT18X18SIO` with its registers),
  distributed RAMs (`RAM16X1S`, `RAM16X1D`, `RAM32X1S`, `RAM64X1S`), shift registers in SRL16 LUTs
  (inferred: chains of 3 or more flip-flops without reset; `SRL16(E)(_1)` instantiated) and the
  DCM (`DCM_SP` on the top-left DCM: CLK0, CLK2X, CLKDV, CLKFX on global buffers, LOCKED; input
  period 20 ns) are packed, placed, routed and written into the bitstream with no Xilinx tool. ISE
  converts the routed designs to the same .bit with no DRC error or warning. What the bit database
  does not have yet fails with the reason (the DCM outputs CLK2X180 / CLKFX180 on a global buffer,
  a second DCM, `BUFGMUX` clock switching, the SRLC16 cascade). Shift registers make designs smaller (the srl
  fixture: 63 slices instead of 79). Unused inputs no longer get a pad. Yosys's "Resizing cell
  port" messages of its block-RAM mapping are not warnings of the design.
- **Design corpus:** 38 real open-source designs (SERV, PicoRV32, FemtoRV32, NEORV32, light8080, T80,
  UARTs, SPI, I2C, CRC, FIFO, AES / SHA / SipHash, the VTR and EPFL benchmarks; Verilog and VHDL;
  fetched at pinned commits, never committed) go through every stage of the toolchain, with the
  time and the warnings of each (`npm run test:designs`, test/designs-corpus/README.md): 24 complete the
  fully open flow on the XC3S250E (10 through an I/O wrapper). Fixed on the way: `ieee.math_real` (`ceil`,
  `log2`… and `UNIFORM`), aggregates such as `(others => '0')` as port and generic actuals,
  `boolean(…)`, generics of an unconstrained array type, a Verilog `?:` of strings in a parameter,
  `$display("%02d")` padding with zeros, a spurious "function assigns signal" warning for tasks and
  procedures, a function's local memory in the open synthesis (a CRC and a PRBS generator became
  constant). Fully open bitstreams of four corpus designs for the Basys2, among them SERV, a RISC-V
  CPU, counting on the LEDs.
- Silinx's own messages are labelled Silinx, not XST: the design checks of Check Syntax
  (`WARNING:Silinx:646 - Signal <…> is assigned but never used…`) keep XST's number for the same
  finding, and their explanation says "Xilinx ISE's XST reports this as Xst:646"; the open
  toolchain's errors are `ERROR:Silinx`. XST's own messages (ISE modes) keep `Xst`.
- **Design checks, closer to XST:** an input bus of which only some bits are read gets the unused
  bits, as XST does (`WARNING:Silinx:647 - Input <btn<2:1>> is never used.`), and Verilog names
  that differ only in case (`scorer` and `scoreR`, which XST renames) are reported
  (`WARNING:Silinx:863 - Name conflict (<scorer> and <scoreR>, …)`) (#38). The checks without an
  XST number are labelled `Silinx`, no longer `Lint`, and the `$clog2` warning is at the line of
  its declaration or parameter, no longer at line 1 (#16).
- **Verilog: `$clog2` inside a constant function:** `$clog2` of the function's own argument
  (`function integer f(input integer v); f = $clog2(v); endfunction` with `localparam W = f(N);`)
  was refused as `expression is not constant`. It now folds when the function is evaluated as a
  constant, and works at run time too (#59).
- **Xilinx primitives from Verilog:** a Verilog design can instantiate the UNISIM primitives
  (`BUFG`, `FDCE`, `SRL16E`, `RAMB16_S9`, `DCM_SP` …) with no library clause, as XST allows: they
  simulate with Silinx's models and stay primitives in the open synthesis (#17). In the browser,
  Check Syntax, the RTL schematic, the behavioural simulation, the emulator and the Test Bench
  Wizard now find the primitives of a VHDL `library UNISIM` design too; the project's module list
  still shows only its own modules.
- **Design checks:** an input read only by a pin a primitive samples at its clock edge (an
  `FDCE`'s `D` or `CE`) is no longer reported as `Input <d> is never used.` (#66).
- **VHDL null ranges, the rest:** an integer subtype with a null range (`range 5 to 3`) is null:
  loops over it do not run and arrays of it have no element. A slice with non-constant bounds
  against its direction (`v(i + N - 1 downto i)` with `N = 0`) reads and writes nothing. A process
  that only assigns vectors of no bit no longer gives the open synthesis an empty `always` block
  (#61).
- **VHDL integer subtype attributes:** `'high`, `'ascending`, `'leftof` and `'rightof` of a
  descending subtype (`integer range 10 downto 0`) were those of an ascending one; `'low` and
  `'high` of a null range follow its direction (#67).
- **VHDL: slices of arrays of vectors** (`mem(0 to 3)` of an array of `std_logic_vector`) are
  simulated: read, assigned to variables and signals, from aggregates, sliced again, null, in
  constants and as arguments (#11). The open synthesis reports them as not supported yet, at their
  line.
- **VHDL: unconstrained parameters:** a function or procedure called with vectors or arrays of the
  same width but other index ranges took its first call's `'range`, `'left` and indexing
  (`v'left` of a `7 downto 0` argument after a `15 downto 8` one gave 15) (#68).
- **Verilog testbenches: hierarchical names** of a named block's variables (`dut.state_logic.f`,
  `blk.inner.v`, in generate blocks too) are read from the block's process, from the testbench,
  another process or a module above; `$dumpvars` accepts scopes (the testbench's own name, an
  instance, a path) (#12).
- **Open synthesis: VHDL records** are packed vectors, each field at its own bits: a record was
  written with every field at the first field's width, so wider fields were cut off in the netlist
  (#69). Arrays of records (and of arrays) are memories of those vectors; a field or element is
  read and assigned at any depth, also with a variable index; a record port connects to an
  element of an array of records (neorv32's `trace_o => cpu_trace(i)`), constant arrays of records
  are tables (#10). Constant slices of arrays (`h(0 to 1) <= m(2 to 3)`) are synthesized word by
  word.
- **VHDL: array slices with run-time bounds** (`br(n to size - 1) := (others => x"00")` in a
  function, as light8080's `objcode_to_bram`) are simulated (#11).
- **VHDL file objects** (`file f : TEXT open write_mode is "log.txt";`, `file` parameters, `LINE`
  variables) elaborate; the textio calls on them are still ignored, with their warning.
- **Open synthesis: VHDL bit indexes by `to_integer`** (`sh(to_integer(cnt)) <= din`) are the
  vector itself for Yosys, no longer a 32-bit signed index: nandland's SPI master in VHDL is 49
  LUTs (was 74; 46 in Verilog), and a small receiver gives exactly the Verilog design's cells. A
  signal driven only by a constant (`w_cpol <= '1' when MODE = 2 else '0';`) is read as that
  constant, so a reset value that names it is a constant (#14).
- **VHDL: constrained string variables** (`variable v : string(1 to n);`) start with their n
  characters; they were empty, so writing a character into one stopped the simulation (neorv32's
  version banner) (#70).
- **Fully open bitstreams, tested on the board:** blinky and lab11, synthesized, placed, routed
  and written by Silinx with no Xilinx tool, work on a Basys2-250.
- **How the Silinx toolchain compares with ISE** ([docs/QUALITY.md](docs/QUALITY.md)): the size and
  speed of what it generates against ISE 14.7 (XST, map, par) on the open-source designs of the design
  corpus, on the same chip and the same top, ISE given its best chance (map packing tightly, a tight
  clock constraint), both critical paths by ISE's trce. On the 22 designs both build: 23% fewer logic
  LUTs and 18% fewer slices than ISE, critical paths 15% longer; XST cannot read 11 of the designs.
  ISE projects can set map's packing (`impl.mapPackFactor`, map -c).
- **Two more examples:** *pong* (LED Pong, a game for two players, in Verilog: the ball is the lit
  LED, each player returns it with a button, the score on the 7-segment display) and *stopwatch*
  (in VHDL: seconds and hundredths, laps stored in a block RAM and recalled, the decimal digits
  computed with the multipliers), besides *blinky*; the Start page offers the three. Each has a
  self-checking testbench and runs on every device of the Silinx toolchain (Basys2-100 / 250,
  Nexys2-500 / 1200). They are also Silinx's test designs: their testbenches, the board pin
  assignment, the whole Silinx toolchain on every device and, with ISE, byte-identical bitstreams.
- A project created from an example for another board gets that board's pins (the example's UCF
  was copied unchanged: a Basys2's pins on a Nexys2).
- **The Silinx toolchain, the default:** *Toolchain Settings* has a new execution mode, *Silinx
  toolchain (experimental, no ISE)*, and a new installation starts in it, so students need no
  Xilinx tool for the Basys2 and Nexys2 boards (a saved configuration keeps its mode; one that says
  `open`, the name it had during development, is read as `silinx`). *Synthesize*, *Implement
  Design* and *Generate Programming File* then run Silinx's own flow on the server (Yosys
  synthesis, pack, place, route on the switches whose bits are known, static timing against the
  UCF's PERIOD constraints, bitgen), with the usual console, process icons, Stop and *Design
  Summary* (utilization and timing, marked "Silinx toolchain"). It writes `build/<top>.bit` (what
  *Configure Target Device* programs) and `build/<top>_prom.bit`; *View Implemented Design (FPGA)*
  shows the routed design on the device description. The supported devices' descriptions and bit
  databases ship with Silinx: the mode has no ISE setting. A device the Silinx toolchain does not
  support, or a design it cannot implement yet, fails with the reason and what is missing (use an
  ISE mode); the processes that need ISE are disabled in that mode, with a tooltip. Developers can
  build another device's description from an ISE (`research/s3e-route/build-device.mjs`).
- The device descriptions of the XC3S100E-CP132 (Basys2-100), XC3S500E-FG320 (Nexys2-500,
  Spartan-3E Starter Kit) and XC3S1200E-FG320 (Nexys2-1200) ship with Silinx too (their bit
  databases are next).
- The device description of the XC3S250E-CP132 (Basys2-250) ships with Silinx
  (`core/fpga/devices/`): the Silinx toolchain places, routes and writes the bitstream for that board
  without ISE (from the interface, see above, or from the command line:
  `research/s3e-route/open-flow.mjs`). For other
  devices it is built once from the user's own ISE installation (`~/.silinx/devices/`, which takes
  precedence). The whole open flow on blinky is now part of the tests.
- What is planned, bugs and feature requests are GitHub issues
  (https://github.com/pmnmalo/Silinx-ISE/issues; TODO.md is gone). The Silinx toolchain does not support the Spartan-6 boards (Nexys3,
  Atlys) yet; it will.
- Verilog / SystemVerilog constructs Silinx now reads, simulates and synthesizes (found by the
  corpus of Yosys's test designs): hierarchical names into generate blocks and named blocks
  (`blk.x`, `blk[i - 1].x`, `genblk1.t`: unnamed generate blocks are named as IEEE 1364-2005
  12.4.3 says), the module's own name as a scope, functions and tasks called by hierarchical names,
  arrays of instances (`inv u[3:0] (…)`), `wand` / `wor` / `tri0` / `tri1` / `supply0` /
  `supply1` ports (and wired nets with several drivers in synthesis), typedefs, enumerations,
  packed structures, multi-dimensional packed arrays, unpacked `[N]`, casts `T'(x)`, declarations
  outside modules, `localparam` in functions and blocks, `specparam` and `specify`, immediate
  assertions, `$size` / `$left` / `$right` / `$low` / `$high` / `$increment` / `$dimensions`,
  `$countbits` / `$onehot` / `$onehot0` / `$isunknown`, `$floor` / `$ceil` and the other real math
  functions, elaboration tasks (`$info`, `$warning`, `$error`), `*=` `/=` `%=` `<<=` `>>=`, strings
  used as values, macros that join the text around them (`` `WIDTH'b0 ``, `` f_`name ``), `` ``
  pasting and default macro arguments, an output net's `= value` as a continuous assignment.
- **Smaller, faster netlists from the open synthesis** (research/synth-quality/README.md): lab11
  now needs 165 slices instead of 403 (XST: 180) and runs at 14.1 ns instead of 17.6 ns in the
  open flow; the blinky example 86 slices instead of 104 (XST: 99), 7.7 ns instead of 11.8 ns.
  Yosys's LUT mapping for the Spartan-3E (LUTs of up to 8 inputs, each split into LUT4s and
  MUXF5-8) is replaced by ABC on LUTs of up to 6 inputs at their real cost; arithmetic that reads
  at most 6 input bits (VHDL integers, `shift_left(to_unsigned(1, 32), n) - 1`) is written as a
  table of its values instead of 32-bit carry chains; the packer puts flip-flops fed by
  flip-flops into the free slots of carry-chain and multiplexer slices. Size budgets in the tests
  (test/synth-quality.test.js, a new 42-state accumulator machine fixture `cpu8`).
- **Faster designs from the Silinx toolchain's place and route** (research/s3e-route/README.md):
  lab11 runs at 11.6 ns by ISE's own timing analyzer (was 13.7 ns; ISE's whole flow: 10.9 ns), the
  blinky example at 7.4 ns (was 8.0; ISE: 6.7), and both are placed and routed faster. The placer
  is timing-driven as VPR's (the estimated delay of every connection, from a table of the fastest
  routes of the device, weighted by its criticality), the router may swap the inputs of a LUT
  (rewriting its equation), as ISE's does, and counts the load each new branch of a net puts on
  its critical connections. `open-flow.mjs --tries N` keeps the fastest of N placements.
- The open synthesis of a Spartan-3E design no longer prints Yosys's "Shift register inference
  not yet supported for family xc3se" (it came on every run, whatever the design) nor counts it
  as a warning.
- The differential test of the open synthesis (RTL against the netlist) no longer reports a false
  difference when the RTL's state is at X at power-up: an output of the netlist agrees when it
  agrees with the RTL powered up at 0 or with the RTL with its X's (where a case on an X state
  takes its default), port by port; a difference from both is still reported (#20).
- VHDL null ranges (`N - 1 downto 0` with N = 0, `0 to -1`) have no element, as the language
  says: they gave one bit (two for `-1 downto 0`). Generic designs with optional ports of N = 0
  bits simulate and synthesize (a vector of no bit is left out of the open synthesis's module and
  its ports) (#15).
- Open synthesis: a VHDL state machine whose state signal has no initial value powers up in its
  first state, as in simulation and with XST: the default initial value of an enumeration (or
  boolean) signal is written for Yosys, which could start the re-encoded state register in another
  state (#9).

## 15.10.1

- Fixed in Safari: after a click on a schematic symbol, an ASM chart block or a state of a state
  diagram, the editor's keys (Delete, F1, Ctrl+C…) did nothing. Tests now run what users get: the
  release zip is unzipped, started with its launcher and synthesizes in the browser without the
  Internet; the main UI flows run in Firefox and WebKit as well as Chrome; the unit tests and the
  launchers run on macOS and Windows as well as Linux.
- The modern interface shows the version after "Silinx ISE" in its header, as the classic title bar does.
- *Help ▸ About* and the README: Silinx ISE is described as developed to support the teaching of
  Digital Systems, without naming an institution (Silinx is the work of Pedro Maló, in his own time).
- Fixed: exporting a Xilinx ISE project with several schematics could report identical custom
  symbols as different ("custom symbol … differs"), when the export took more than a second.
- **Synthesis front end** (`core/synth-verilog.js`, first version): Silinx writes the elaborated
  VHDL / Verilog design as one flat synthesizable SystemVerilog module for Yosys, so that synthesis
  needs neither GHDL nor ISE (and can run in the browser). lab11 and the blinky example go through
  Yosys to a Spartan-3E netlist that behaves as the original in simulation.
  It also handles initial blocks (initial values of registers and memories) and Xilinx primitives
  instantiated by name (block RAMs, clock buffers, DCMs, shift registers): every test design
  synthesizes to a netlist that behaves as the original.
- **Packer and placer** for the Spartan-3E (`core/fpga/`, first version): Yosys's netlist packed
  into slices (LUTs, flip-flops, latches, carry chains, F5-F8 multiplexers), I/O pads and global
  clock buffers, and placed by simulated annealing; checked with ISE (routing of our placement and
  simulation of the result) on lab11 and blinky.
- **Router** for the Spartan-3E (`core/fpga/route.js`, first version): PathFinder over the device's
  routing graph (built once per computer from ISE's device report, never shipped). lab11 and blinky,
  synthesized, packed, placed and routed by Silinx, with ISE only writing the bitstream, pass ISE's
  design rule check and work on a Basys2.
- *Toolchain Settings*: the SSH mode (now *Remote host with Xilinx ISE via SSH*) can run the ISE flow in a Docker
  image on the remote host (*Docker image on the remote host*), so another machine with the
  Silinx ISE image can build, e.g. an Intel Mac, where ISE runs natively instead of emulated as on
  Apple Silicon (lab11: about 70 s instead of 10 minutes).
- FPGA view: selecting a site or a net no longer rebuilds the list of nets (a click takes half the
  time, with less memory churn in Safari).
- Memory tests (`test/ui/memory.test.js`): opening and closing the FPGA view, the editors, ISim and
  the board emulator, selecting in the FPGA view and switching projects many times must leave
  nothing behind (JS heap, DOM nodes and event listeners after garbage collection), and the page
  must stay within a memory budget. The same scenarios also run in WebKit, Safari's engine
  (`npm run test:webkit`, with Playwright), within a memory budget.
- **Bitstream writer** for the Spartan-3E XC3S250E (`core/fpga/bitstream.js`, `bitgen.js`, first
  version): a placed and routed design to a `.bit` file, from a bit database measured by black-box
  experiments (`research/s3e-bitstream/db`). For switch -> LED, blinky and lab11 implemented by ISE,
  the file is byte-identical to ISE's bitgen (CRC on and off). Designs placed and routed by Silinx
  still use a few routing switches not measured yet. The package's pads come from the device
  description built from the user's own ISE, never from the repository.
- A test that the repository holds no data that must not be published
  (`scripts/check-private-data.mjs`, run by `npm test` on every tracked file; `--history` also checks
  the whole git history): e-mail addresses, home folders with a user name, logins, computer names
  and network addresses, passwords, keys and access tokens, and Xilinx files (ISE's outputs,
  licences, device reports).
- **Synthesize - Yosys (open)**: a new process that synthesizes the design in the browser, without
  Xilinx ISE: Silinx's front end writes the design as one flat module and Yosys, compiled to
  WebAssembly (YoWASP), maps it onto the cells of the device family in a Web Worker. The console
  shows Yosys's messages and the utilization (LUTs, flip-flops, multiplexers, carry logic, clock
  buffers, I/O…); the netlist is saved in `build/open/` (JSON and Verilog). Generated HDL files in
  `build/` are no longer added to the project's sources. (The app's download grows by the Yosys
  WebAssembly module, about 75 MB unpacked.)
- **Fully open bitstreams** for the Spartan-3E XC3S250E: the router can keep to the routing switches
  whose bits the database knows, and the packer can bring a carry out through an XOR stage instead
  of the unmeasured XB / YB pins, so blinky and lab11 go from VHDL / Verilog to a `.bit` file with no
  Xilinx tool at all (`research/s3e-route/open-flow.mjs`). Checked against ISE: 0 DRC errors and a
  bitstream byte-identical to ISE's bitgen for the same routed design (8 placements, CRC on and off).
- **Timing** in the open flow (`core/fpga/timing.js`): a delay model of the XC3S250E -4 fitted to
  ISE's own timing reports of Silinx-routed designs (0.1 ns rms per connection), a static timing
  analysis (within 1.4% of ISE's on average), and timing-driven routing and placement: lab11 runs at
  17.2 ns (58 MHz) instead of 21-24 ns, under the Basys2's 20 ns clock; blinky 11.5 ns.
- **Bit database, stage D** (`research/s3e-bitstream`): blinky and lab11 placed and routed by
  Silinx are byte-identical to ISE's bitgen; the I/O, block-RAM and DCM tiles share the CLB's
  switch box; the open SLICEM bits are the SLICEM instance type; new: the clock pins from every
  global line, carry outputs, long lines, terminal tiles, block-RAM contents and settings,
  multipliers, distributed RAM and shift registers, the top-left DCM, and I/O standard / drive /
  slew / pull per pad (92% of the device's routing switches; `research/s3e-bitstream/README.md`).
- Tests with Xilinx ISE on another machine (for the developers, e.g. an Intel Mac where ISE runs
  natively): `SILINX_ISE_HOST=user@host` runs the real ISE flow tests there (79 s instead of ~15 min
  emulated), and `npm run check:open-flow` checks the fully open flow against ISE (design rule check,
  byte-identical bitstreams). The open flow now synthesizes with the WebAssembly Yosys (nothing to
  install).
- Open synthesis fixes: instantiated FD, FDE, FDR, FDS, FDC, FDP, FDRS, FDCP, LD, LDE, LDC and LDP
  primitives (not in Yosys's library) become the equivalent FDRE / FDSE / FDCE / FDPE / FDRSE /
  FDCPE / LDCE / LDPE cells; a process variable's declared initial value is kept (it was lost: the
  flip-flop started at 0); a procedure's variables start at their declared values on every call.
- Open flow: the clocks' periods are checked against the UCF's PERIOD constraints (the clock found from its port through the clock buffers; met / not met with the slack, in timing.txt).
- One XDL writer (`core/xdl.js` `writeXdl`) for the router, the bitstream tools and the placer (`core/fpga/xdl-write.js` removed).
- Verilog: SystemVerilog size casts `W'(expr)`.
- **Differential tests** of the front ends, the simulator and the open synthesis: every example
  and test design is simulated as RTL and as the Yosys netlist with the same random stimulus,
  cycle by cycle; Yosys's own test designs (`npm run test:corpus`, fetched at a pinned version)
  and VlogHammer-style random expressions (`npm run test:vloghammer`) are compared with Yosys.
  Fixed what they found: Verilog signed operands in unsigned comparisons, shifts, `?:` and nested
  expressions are zero-extended (they were sign-extended); `?:` of a signed and an unsigned operand
  of the same width is unsigned; `case` items and expression are extended together (signed only
  when all are); the synthesis front end wrote `>>>` of an unsigned value as an arithmetic shift
  and could truncate a `case` item wider than the expression.
- How the open toolchain for the Spartan-3E is being developed: `docs/OPEN-TOOLCHAIN.md`, and the
  first experiments in `research/s3e-bitstream`.

## 15.10.0

- **A new, modern interface** (the default), alongside the classic Xilinx ISE one (*View ▸
  Interface*, remembered by the browser; both have every feature). It has a header with the
  project and a search box; an activity bar for Start / Design / Files / Libraries; document tabs
  above the editor; and labelled buttons for the design flow (Check, Simulate, Implement, Emulate,
  Program). Dialogs, menus and controls follow current design practice, the whole interface is
  usable from the keyboard, and the window adapts to small screens.
- **Light and dark themes** in the modern interface: they follow the system by default, or are
  chosen with *View ▸ Theme* or the header button. Diagram sheets stay light paper; the HDL editor,
  ISim and every panel follow the theme.
- **Command palette** (Ctrl+K / Cmd+K, or Ctrl+Shift+P): search any menu command or project file by
  name and run or open it from the keyboard. In Portuguese it finds commands by their Portuguese
  or English names.
- **View Implemented Design (FPGA)**: how ISE placed and routed the design inside the chip
  (*Processes ▸ Implement Design ▸ Place & Route*, or *Tools*).
  - The device as its grid of logic blocks, I/O pads, block RAMs, multipliers, clock buffers and
    DCMs, with the used sites coloured by module (at any hierarchy level) and the utilisation.
  - Click a site to see its logic: LUT equations with the names of their input signals,
    flip-flops (clock, enable, set / reset, initial value), carry chain and multiplexers; for a
    pad, its port, package pin, direction, I/O standard, drive and slew rate.
  - **Inside a slice** (Spartan-3 / Spartan-3E): a diagram of the slice with the parts the design
    uses (LUTs F and G, F5 multiplexer, carry chain, output multiplexers, flip-flops FFX and FFY)
    in the module's colour and the pins that carry signals; the other slices of the same CLB.
  - **How each function is implemented**: a LUT is a 16-bit memory. The view shows the truth
    table it holds, with the names of its input signals, its 16 memory bits and the INIT value,
    and marks the LUTs that only pass a signal through (route-thru).
  - Nets: what a net connects and the tiles its routing goes through; a site's connections;
    the global clock network; search by name.
  - The Design hierarchy and the chip select each other's modules.
  - Zoom and pan. The view reads the routed design with ISE's `xdl` (a new `fpgaview` step that
    only runs Place & Route first when needed).
- **Board emulator: the power switch works.** Off stops the board (LEDs, displays and LCD go
  dark); on starts the design again from time 0, as configuring the FPGA at power-up does.
  Switches moved while the board is off are read at power-up.
- **Clear Recent Projects** (*File ▸ Recent Projects*, and a link on the Start page). The projects
  themselves are kept.
- Fixed: Check, Simulate, Emulate and Program stayed disabled while an implementation was running;
  only Implement has to wait for it (also for *Run* in the right-click menu of the processes).
- Fixed: the Design Summary could not be reopened from the Processes panel once closed, unless a
  module was selected in the Implementation view. *Design Summary/Reports* is now there whatever is
  selected, in both views.
- *Help ▸ About* describes what Silinx does today (schematics with live simulation, FSM and ASM
  editors, truth tables and Karnaugh maps, wizards, netlist simulation, board emulator).

## 15.9.3

- **Remove from Project keeps the file** in the project folder, as in ISE. The file leaves the
  project (hierarchy, compilation, simulation, synthesis) and is listed as *Not in project* in the
  Files view; right-click ▸ *Add to Project* brings it back.
- **Undo / Redo of Remove from Project**: the toolbar Undo / Redo buttons, *Edit ▸ Undo / Redo*
  and Ctrl+Z / Ctrl+Y (Cmd+Z / Cmd+Shift+Z on a Mac) outside an editor, and the *Undo* button of the
  message shown after removing.
- **Top-Level Source Type** in the New Project wizard: HDL, Schematic, State Machine (FSM),
  State Machine (ASM) or Truth Table. A non-HDL type starts the project with that document and its
  synchronized HDL module `top`.
- **Release notes**: this changelog; each GitHub release and the update dialog show what is new.
- Fixed: two project reloads close together could leave the older file list on screen.
- **Licence: GNU AGPL-3.0** (was Apache-2.0), with an additional permission to combine Silinx
  with elkjs (EPL-2.0); *Help ▸ About* shows the licence, the no-warranty notice and the source code link.
- **Licence notices**: NOTICE and THIRD-PARTY-NOTICES.md (the open-source components Silinx ships
  and their licences), also embedded in Silinx-ISE.html; *Help ▸ About* shows the copyright and the
  components.

## 15.9.2

- **Tri-state buffers** in the schematic library (category *Tri-State*): BUFE, BUFE4, BUFE8,
  BUFE16, BUFT, BUFT4, BUFT8, BUFT16. Several tri-state outputs and inout markers may share a bus;
  live simulation shows Z (blue) and conflicts (red); Symbol Info datasheets with Z in the truth table.
- Exported ISE schematics write tri-state buffers as Silinx symbols with their HDL (ISE's FPGA
  libraries have no BUFE/BUFT); checked with ISE 14.7 for Spartan-3E.

## 15.9.1

- New Source: *State Machine (FSM)* is listed before *State Machine (ASM)*.

## 15.9.0

- **State Machine (FSM) editor**: Moore and Mealy bubble diagrams with plain-language checks
  (unreachable states, overlapping or incomplete conditions), state / transition / encoded tables,
  truth tables of the next-state logic, a step-by-step simulation panel, and VHDL / Verilog kept in
  sync both ways; conversion to and from ASM charts.
- **Beginner-friendly messages and design checks**: every error keeps its ISE message, followed by
  an explanation and how to fix it (English and Portuguese); warnings for latches, missing
  sensitivity entries, two drivers, combinational loops, unused or unassigned signals, clock misuse
  and more. *Edit ▸ Design Checks* turns the warnings off; `-- silinx: ignore` silences one line.
- **Symbol Info**: a datasheet for every schematic symbol (description, pins, parameters, the
  truth / mode table, the equivalent VHDL and Verilog).
- **New Source reorganised**: Truth Table, Module (HDL), Module (Wizard), Schematic (Diagram),
  Schematic (Wizard), State Machines, Test Bench (HDL), Test Bench (Wizard), constraints, memory files.
- **Module Wizard** and **Schematic Wizard**: ports (inputs, outputs, inout), combinational or
  sequential templates with clock / reset, ready-placed I/O markers.
- **Inout ports** in the Module, Schematic and Test Bench wizards; Test Bench Wizard *No vectors*
  mode (a skeleton to write the stimulus yourself).
- No simulation top any more: *Simulate* runs the module selected in the Simulation view.
- Creating a file that already exists asks whether to replace it.
- *Implementation only* association in *Add Copy of Source*.
- The app checks for a newer release when it starts.
- Files are saved atomically (no half-written file after a crash).

## 15.8.0

- **Live schematic simulation** (like Logisim): *Simulate* in the schematic editor; click inputs,
  step or run clocks, wires coloured by their value, outputs and stored values shown.
- **Truth Table / Karnaugh Map tool**: tables of up to 6 inputs, K-maps with the groups drawn,
  minimal SOP / POS, canonical forms, a check of your own expression, and a linked VHDL / Verilog
  module kept in sync both ways; gate schematics generated from the table.
- I/O Pin Planning leaves the I/O standard at *default* unless one is chosen.

## 15.7.0

- **Test Bench Wizard**: self-checking test benches (exhaustive, random, counting, walking or typed
  vectors; expected values typed in or taken from the current design); every mismatch is reported,
  then TEST PASSED / TEST FAILED. The benches also run in Xilinx ISim.

## 15.6.1

- 1-bit vector ports are written as `x<0>` in the UCF; latch gates get global clock pins;
  schematic flip-flops with unconnected CLR / CE generate valid HDL; Files view can rename and
  delete folders.

## 15.6.0

- Many simulator fixes and additions found by a large new test suite (VHDL records, 2-D arrays,
  overloading, case-generate; Verilog macros with arguments, `include`, defparam, named events …).
- Netlists from the real ISE 14.7 are checked against their RTL for 13 designs.
- The board emulator no longer jumps up and down (seen on Safari); knob turns are never lost.
- About and README: Silinx ISE was developed to support the teaching of Digital Systems,
  because AMD/Xilinx discontinued Xilinx ISE.

## 15.5.0

- **Board emulator**: run the design on a drawing of the real board (Basys2, Nexys2, Spartan-3E
  Starter Kit with its LCD and rotary knob); the timing of slow designs is scaled so they visibly run.
- **Netlist simulation**: simulate and emulate the post-synthesis, post-translate, post-map and
  post-place & route models from ISE; technology schematic, timing, power and pin reports.
- DCMs synthesize their real output frequencies; many more Xilinx primitive models.
- A full audit: fixes in the simulator, schematics, ASM charts, UCF handling, server and web UI.

## 15.4.0

- *Help ▸ Check for Updates*; About shows the GitHub project and the developers.
- *Add Copy of Source* only (Add Source removed); New Source left the File menu.

## 15.3.0

- Import / Export of Silinx ISE projects and of Xilinx ISE projects (.zip).
- ASM charts: case (multi-way) boxes and bit / slice conditions; printing and Save PNG.
- Processes panel with ISE-style expand / collapse that remembers its state.

## 15.2.4

- RTL schematic: *Up* and *Push into* buttons.

## 15.2.3

- Distribution files renamed: `Silinx-ISE.html`, `silinx-ise-<version>.zip`.

## 15.2.2

- Maintenance release.

## 15.2.1

- Schematic and ASM editors: Backspace deletes the selection again (as Delete).

## 15.2.0

- The project is renamed **Silinx ISE** (it was XAIlinx ISE).

## 15.1.0

- Schematic editor: T and JK flip-flops, the full D flip-flop family, inverted-input gates,
  decoders, encoders, demultiplexers; moving components keeps their connections.
- The version is shown in the title bar.

## 15.0.2

- ASM charts: registers power up with their reset values.

## 15.0.1

- Window titles without the version number.

## 15.0.0

- Version numbering in the style of ISE (15.x); the project is called *XAIlinx ISE*.

## 0.3.0

- Beginner-friendly start: double-click launchers and a step-by-step guide.

## 0.2.0

- README: download section.

## 0.1.0

- First release: ISE-style projects with VHDL / Verilog, a syntax-checking editor, the schematic
  editor and ASM state-machine charts kept in sync with HDL, ISE schematic import / export,
  behavioural simulation with waveforms, Xilinx ISE 14.7 implementation (Docker / local / ssh),
  UCF checks, ISE project import, English and Portuguese interface.
