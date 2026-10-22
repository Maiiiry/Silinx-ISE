In short:

- **Writing with a pen on an iPad** no longer selects the text above the handwriting pad.

In detail:

- **The handwriting pad on an iPad (#1086):** the pad cancels its touches' own actions (iPadOS selected the dialog's
  text around the pen, or took the writing for Scribble's), and the handwriting dialogs' text is not selectable (their
  text fields are); the pointer events, which draw, still come.
