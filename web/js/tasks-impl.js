// The Tasks interface's Implement task (#802, #782).
// - Its side panel is the Implementation view's Processes list for the top module, with ISE's names (Synthesize,
//   Implement Design ▸ Translate, Map, Place & Route, Generate Programming File), each with its state, run by a
//   double-click, its other processes (simulation models, timing, power, the FPGA view) in its menu; the UCF and I/O
//   Pin Planning among them (showTopProcesses; the Edit task's tree is not shown in Implement: web/css/tasks.css).
// - Its page is the Design Summary, laid out as cards; its Programming File links to Program (web/js/summary.js) and
//   its reports open in Implement (web/js/tasks.js taskOfDoc: a build file is Implement's).
// - It comes to the front when an implementation ends while Implement is in front (implementationEnded).
// implementationEnded has no DOM and is unit tested (test/tasks.test.js).

/** The Processes list of the top module in the Implementation view (Implement's side panel). */
export function showTopProcesses(app) {
  const S = app.S, top = S.project?.top;
  S.view = 'impl';
  // (no top: none selected, the panel drawn so, not left as it was, #1162)
  S.sel = top ? { type: 'module', module: top, file: S.modules.find(m => m.name === top)?.file } : null;
  app.renderProcesses();
}

/** An implementation ended: Implement's state dot went from running to done (with or without warnings). */
export const implementationEnded = (prev, now) => prev === 'running' && (now === 'ok' || now === 'warn');
