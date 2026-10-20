In short:

- **Touch screens (iPad): two fingers move the drawing, a pinch zooms it:** in the schematic, ASM chart, state
  diagram and Petri net editors and the waveform viewer, a two-finger drag pans the view (it selected, like one
  finger) and a pinch zooms it; one finger still selects and moves parts as before.

In detail:

- **Two fingers on a drawing (#674):** `twoFingerView` (`web/js/ui.js`): a second finger on a drawing's canvas takes
  the gesture from the editor, undoing what the first finger started (a selection band, a move, a changed
  selection; in the waveform viewer, the cursor moved); the fingers' centre pans the view and their spread zooms it
  about that centre, once a frame from every finger's last point; Safari's own pinch of the page is turned off on
  the canvas. The UI test simulates the gestures (real touch events in Chrome, the touch screen's pointer events
  in WebKit and Firefox: `page.touchGesture`).
