# C to HDL: Silinx C (high-level synthesis)

A C function as a design source: Silinx turns it into a VHDL or Verilog module, as AMD's **Vitis HLS**
(formerly Vivado HLS, user guide UG1399) does for AMD's newer parts. The C file is the module's base;
its HDL is generated from it, read-only, as a drawing's is. The plan and its phases: issue #1532.

Silinx C is a **subset of what Vitis HLS accepts**: a source Silinx takes also goes through Vitis HLS
(as C++), with the same ports and the same behaviour at them. Vitis HLS does not target the
Spartan-3E, so it is not Silinx's oracle: the C itself is (see *Checking it* below).

## The source

- A `.c` file in C99, plus Vitis HLS's arbitrary precision integers (`#include "ap_int.h"`):
  `ap_int<W>` and `ap_uint<W>`, `W` from 1 to 1024. They are the only C++ syntax Silinx C accepts.
- Known headers: `ap_int.h`, `stdint.h`, `stdbool.h`, `stdio.h` (for `printf` in test benches,
  ignored by synthesis), `hls_stream.h` is refused (not yet).
- The **top function**: the one named by `#pragma HLS TOP name=…`, else the file's last function
  that is not `main`. The other functions are inlined into it. `main()` is the test bench (C
  simulation, C/RTL co-simulation); it is never synthesized.
- `#define` constants and function-like macros of one expression; `#if`/`#ifdef` on them.

### Types

| C | Bits | Signed |
|---|---|---|
| `bool` | 1 | no |
| `char`, `signed char` / `unsigned char` | 8 | `char` signed (as `-fsigned-char`) |
| `short` / `unsigned short` | 16 | |
| `int` / `unsigned` | 32 | |
| `long`, `long long` and their unsigned | 64 | |
| `int8_t` … `int64_t`, `uint8_t` … `uint64_t` | as named | |
| `ap_int<W>` / `ap_uint<W>` | W | yes / no |

No floating point, no `ap_fixed` (refused with a message; a later phase). `const` is kept; `volatile`
is accepted on arguments and has no effect (as in Vitis HLS's default).

### Arithmetic

- C types follow C: the integer promotions and the usual arithmetic conversions, wrap-around on
  `unsigned`, signed overflow refused where Silinx can see it (it is undefined behaviour: the
  hardware would differ from the C).
- `ap_int` / `ap_uint` follow Vitis HLS: an operation's result is wide enough for any value of its
  operands (`a + b`: one bit more than the wider; `a * b`: the sum of the widths), then it is
  truncated (or sign-extended) when assigned. A C integer mixed with an `ap_int` takes its own width
  and signedness.
- Shifts by a negative or a too large amount, division by zero and reading an uninitialised
  variable are undefined behaviour: refused where Silinx can see it, else their result is not
  specified.

## What can be synthesized (UG1399's rules)

1. The whole functionality in the top function and the functions it calls.
2. No system calls: `printf`, `fprintf`, `puts` are ignored by synthesis (a note); `malloc`, `free`,
   `exit`, file I/O, `time`, `rand` are refused.
3. Fixed or bounded sizes: no dynamic memory, no recursion (direct or through other functions),
   every loop with a bound Silinx can compute (a constant trip count, or `#pragma HLS
   LOOP_TRIPCOUNT max=` for a loop whose count depends on its inputs).
4. Unambiguous: a pointer only to an argument or to an array, never cast between types, no pointer
   arithmetic beyond indexing an array, no function pointers, no `goto`.
5. No undefined behaviour Silinx can see.

Each refused construct has its own message, at its line and column, saying what is not possible
and what to write instead.

## The module made

Names and behaviour as Vitis HLS makes them (UG1399, "Interface synthesis"):

| Source | Ports |
|---|---|
| (clock and reset) | `ap_clk`, `ap_rst` (active high, synchronous) — none for a combinational module |
| the block protocol `ap_ctrl_hs` (default) | `ap_start` in; `ap_done`, `ap_idle`, `ap_ready` out |
| `#pragma HLS INTERFACE ap_ctrl_none port=return` | no block protocol ports |
| the returned value | `ap_return` (its type's width) |
| a scalar argument `int a` | input `a` (`ap_none`) |
| a pointer argument only read | input `p` (`ap_none`) |
| a pointer argument only written | output `p` and `p_ap_vld` (`ap_vld`) |
| a pointer argument read and written | input `p_i`, output `p_o` and `p_o_ap_vld` (`ap_ovld`) |
| an array argument | `ap_memory`: `a_address0`, `a_ce0`, `a_we0`, `a_d0`, `a_q0` |

Ports are `std_logic_vector(W-1 downto 0)` (VHDL) or `[W-1:0]` (Verilog), a 1-bit type a
`std_logic` / plain wire. The block protocol: `ap_start` starts a call; `ap_ready` says the inputs
are read and the next call may start; `ap_done` (one cycle) says the outputs and `ap_return` are
valid; `ap_idle` is 1 while no call runs.

A function with no `static` variable whose loops all have constant bounds (fully unrolled) is
**combinational**: with `ap_ctrl_hs`, `ap_done` and `ap_ready` follow `ap_start` and `ap_idle` is 1;
with `ap_ctrl_none`, only the data ports. Any other function (a loop whose count depends on its inputs, a
`static` or global variable) is a **sequential** module: a finite state machine with a datapath. Its code is cut
into basic blocks (what runs with no jump, its ifs and switches with no loop in them included), one state each,
run in one clock cycle; its variables are registers (a `static` or a global keeps its value between calls, its
initial value set at the reset); its loops, `break`, `continue` and `return` choose the next state. The arguments
are read when `ap_start` is 1 in the idle state; the call's last state has `ap_done` and `ap_ready` at 1 for one
cycle, `ap_return` valid; a pointer output's `_ap_vld` is 1 for one cycle after each write, its value then valid.
A function with a loop called by another, and a division by a value other than a constant power of 2, are not
supported yet. The machine shown as an ASM chart: #1575.

**Arrays and memories** (#1527). A local array of up to 64 elements is registers (one per element; an index that
is not a constant a multiplexer). An array argument is a memory outside the module, `ap_memory`: one port, its
address (`_address0`, enough bits for its size) and enable (`_ce0`), its write enable and data (`_we0`, `_d0`,
when it is written) and the value read (`_q0`, the cycle after its address, as a block RAM gives it); the module
is sequential. A local, `static` or global array of more than 64 elements, and a constant one in a sequential
module, is a memory inside it with the same port, written so that ISE and Yosys make it a block RAM: its
initial values its contents (a `const` array, or one never written, is a ROM); a `static` or global one keeps its
values between calls; one initialized with `{ … }` and written must be `static` (or initialized with a loop).
Each access takes a state: a statement reading a memory has a state per read (its address driven), then its own
(the values read in registers); a write is a statement of its own (`a[i] = v;`, `a[i] += v;`, `a[i]++;`), with no
other side effect in it; the index of a memory has no side effect; a memory is accessed in the top function only
(not passed to a function, not in a `switch`). A combinational function's constant arrays are LUT ROMs.

## Pragmas (`#pragma HLS …`)

| Pragma | In Silinx |
|---|---|
| `TOP name=` | the top function |
| `INTERFACE ap_ctrl_none / ap_ctrl_hs port=return` | the block protocol |
| `INTERFACE ap_none / ap_vld / ap_ovld / ap_memory port=` | the argument's interface |
| `INLINE` / `INLINE off` | every function is inlined (`off` is ignored, with a warning) |
| `LOOP_TRIPCOUNT min= max=` | the bound of a loop whose count depends on the inputs |
| `PIPELINE [II=]` (in a loop's body) | a sequential module's loop: an iteration a state (II=1: its condition, body and step in one clock cycle); a loop that accesses a memory, has a loop or a `continue` in it keeps its states, a warning saying the II made |
| `UNROLL` / `UNROLL factor=N` (in a loop's body) | whole: a loop of constant count run in the state it is in (no state of its own); `factor=N`: N iterations a state. A combinational module's loops are all unrolled |
| `ARRAY_PARTITION variable= type=complete` | the array's elements registers, whatever its size (not a memory); `block` / `cyclic` ignored with a warning |
| `DATAFLOW`, `STREAM`, `LATENCY`, `BIND_OP`, `BIND_STORAGE`, `DEPENDENCE`, `LOOP_FLATTEN`, … and AXI interfaces (`s_axilite`, `m_axi`, `axis`) | accepted and ignored, with a warning; an unknown pragma: a warning |

A loop's pragma is its body's first statements; one elsewhere is ignored with a warning (a function's `PIPELINE`
too). The generation's report (`cToHdl(…).report`) gives a sequential module's states, register bits, memories
and, for each loop, what its pragmas made: its II (states an iteration) and its cycles.

## Checking it

- **Against the C**: the tests compile the C with the host's C compiler (gcc or clang,
  `-fsigned-char`), call it on random and edge inputs, and simulate the generated HDL (VHDL and
  Verilog) on the same calls: the same outputs, call by call.
- **Synthesis**: the generated HDL through ISE with no warnings, and through the Silinx toolchain on
  every supported device.
- **In the app**: C simulation (Silinx's interpreter of Silinx C runs `main()`) and C/RTL
  co-simulation (the test bench's calls drive the generated HDL) — phase 5 (#1528).

## The phases

0. This specification (#1523).
1. The C parser and its checks (#1524), and Check Syntax of a `.c` file.
2. Combinational C to HDL (#1525).
3. Sequential C, `ap_ctrl_hs` (#1526); its machine shown as an ASM chart (#1575).
4. Arrays and memories (#1527).
5. C simulation and co-simulation (#1528).
6. The pragmas (#1529).
7. HDL and state machines to C (#1530).
8. The interface: New Source, the C editor, the processes, an example (#1531).
