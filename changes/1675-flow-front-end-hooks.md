In detail:

- **The open flow's front end and simulation models as hooks (#1675):** step 4 of the toolchain's separation (#1651,
  docs/TOOLCHAIN-SEPARATION.md). The toolchain's flow, core/open-flow-core.js `runFlow(spec, io)`, gets the HDL front
  end (`io.frontEnd`) and the simulation models' steps (`io.simModels`) from its io; without the front end its sources
  are the flat Verilog Yosys synthesizes (a VHDL source is an error), without the models their steps fail.
  core/flow-ide.js `runOpenFlow` is the flow with the IDE's (core/synth-front.js `flowFrontEnd`, and the models'
  module, moved as it is from core/open-flow-models.js to core/flow-models.js); core/open-flow-core.js still exports
  it, so the server's runner, the browser's worker and the tests are unchanged. The toolchain imports none of the
  IDE's modules any more but the old paths' re-exports (test/toolchain-boundary.test.js). Tests:
  test/flow-ide.test.js (a counter through the flow without the front end, a VHDL source refused, the models' steps
  without and with the IDE's hooks, an io's own hook); three examples through the whole flow, the models included,
  give the same log, files and report as before. No behaviour change.
