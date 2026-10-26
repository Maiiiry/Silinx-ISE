# C to HDL: Silinx C (high-level synthesis)

A C function as a design source: Silinx turns it into a VHDL or Verilog module, as AMD's **Vitis HLS**
(formerly Vivado HLS, user guide UG1399) does for AMD's newer parts. The C file is the module's base;
its HDL (and, for sequential code, the ASM chart of its schedule) is generated from it, read-only, as
a drawing's is. The plan and its phases: issue #1532.

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
with `ap_ctrl_none`, only the data ports. Any other function is a **sequential** module: a finite
state machine with a datapath (its schedule shown as an ASM chart), its latency in the report.

## Pragmas (`#pragma HLS …`)

| Pragma | In Silinx |
|---|---|
| `TOP name=` | the top function |
| `INTERFACE ap_ctrl_none / ap_ctrl_hs port=return` | the block protocol |
| `INTERFACE ap_none / ap_vld / ap_ovld / ap_memory port=` | the argument's interface |
| `INLINE` / `INLINE off` | every function is inlined (`off` is accepted, with a note) |
| `LOOP_TRIPCOUNT min= max=` | the bound of a loop whose count depends on the inputs |
| `UNROLL [factor=]`, `PIPELINE [II=]`, `ARRAY_PARTITION` | phase 6 (#1529); accepted and ignored with a warning before |
| `DATAFLOW`, `STREAM`, AXI interfaces (`s_axilite`, `m_axi`, `axis`) | ignored with a warning |

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
3. Sequential C through an ASM chart, `ap_ctrl_hs` (#1526).
4. Arrays and memories (#1527).
5. C simulation and co-simulation (#1528).
6. The pragmas (#1529).
7. HDL and state machines to C (#1530).
8. The interface: New Source, the C editor, the processes, an example (#1531).
