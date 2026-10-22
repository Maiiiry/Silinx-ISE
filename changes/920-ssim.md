In short:

- **The simulator is SSim:** Silinx's own simulator is now called SSim (the Silinx Simulator) in the Processes
  pane, its tab, its console and prompt, the New Project wizard and the README; ISim is Xilinx's (its "I" is ISE's).
  The console's force command is `ssim force`; `isim force` still works.

In detail:

- **ISim renamed SSim, the Silinx Simulator (#920):** every label, message and document of the app's simulator
  (core/simulator.js) says SSim, in English and Portuguese: "SSim Simulator" / "Simulador SSim", the tab
  "SSim (top, model)", the console's first line and its `SSim>` prompt, the New Project wizard's simulator and
  summary. The console's command is `ssim force add | remove`, and the Force Constant / Force Clock dialogs echo
  it; `isim force`, its old name, is still accepted. The internal names stay (the files isim-*.js, the `.isim`
  classes, the document id `isim` and the `isim:` reopen key), so saved sessions and projects open as before.
  Xilinx's ISim keeps its name where it is meant: ISE's project property, the notes on what Xilinx ISim accepts,
  the trademark notice.
