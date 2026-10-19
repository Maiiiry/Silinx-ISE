In short:

- **Silinx for an AI assistant (MCP):** the assistant can now make an empty project for a board, choose its
  top module and test bench (with the constraints from the board's pins), and read the synthesis, map and
  place & route reports of a Silinx toolchain run.

In detail:

- **The MCP server on real use (#460):** tried with Claude Code on a scratch workspace (registered with
  `claude mcp add`, connected; a full flow on pong for the Nexys2-500 and a new counter project). Fixed:
  `get_report` looked for ISE's files after a Silinx toolchain run and answered "run_process first" for the
  synthesis, map and par reports; it now follows the last run's toolchain (Yosys's statistics,
  `build/open/<top>_stat.txt`; the pack and route summaries from the Design Summary) and says which process
  makes a missing report. New tools: `new_project` (an empty project, for a board and its variant) and
  `set_top` (the top module and / or the test bench, each elaborated first; `update_constraints` writes the
  constraints from the board's pins, as Update Constraints), without which a project the assistant writes
  could not be synthesized. The README says how to give the assistant a workspace of its own.
