In detail:

- **mountISim split, fifth part: the drawn stimuli in web/js/isim-stimuli.js (#405):** Edit Stimuli (#336), its
  clicks on the inputs' and outputs' cycles, the run of the stimuli and the check of the expected outputs, Fill
  Expected, their drawing over the waves, and the Stimulus Timing and bus value dialogs move from mountISim to
  mountStimuli(ctx), called at the same point of the mount; no change in behaviour. Tests:
  `test/ui/isim-stimuli.test.js`, the stimuli mounted alone.
