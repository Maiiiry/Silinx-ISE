In detail:

- **The Tasks interface's Simulate task: the waves get the screen; Simulate runs the test bench (#800):** ISim's title
  bar is the task's bar's (the module and the model, #854); its Instances and Objects are the task's side panel,
  folded at first, and the Design pane is not shown, so the wave window has the workspace's width and most of its
  height (on a tablet in portrait too, where the side button folds ISim's columns). Simulate runs the project's test
  bench (its simulation top, else its first test bench, else the top) whatever module is selected, with the model
  chosen in the task's bar (Behavioral, Post-Synthesis, Post-Translate, Post-Map, Post-Place & Route). ISim's run
  controls stay its toolbar, right under the task's bar. The modern and classic interfaces are unchanged.
