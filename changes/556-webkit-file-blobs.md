In short:

- **Safari, the single file opened from the disk:** Generate Programming File runs, and the Board Emulator
  runs designs on its compiled engine (at the board's speed) instead of falling back to the event-driven one.

In detail:

- **WebKit, a file:// page's workers read Blobs (#556):** in WebKit (Safari), the workers of
  `Silinx-ISE.html` opened from the disk started, but could read no Blob (`NotReadableError`, "Cannot load
  blob:null/…": the page an opaque origin), YoWASP's read of Yosys's resources among them, so that Yosys
  could not start: Generate Programming File failed and the Board Emulator fell back to the event-driven
  engine. In a worker of an opaque origin, `readableBlobs` (core/synth-open.js) replaces Blob by one that
  keeps its bytes and reads them in JavaScript; the Yosys workers and the flow worker install it. WebKit's
  workers start no worker of their own from such a page: the flow worker runs Yosys in its own thread there.
  The compiled engine then runs blinky at the speed it has on the site (about 250 M cycles/s at Max speed).
  The standalone test of the single file in a user's browser runs in Firefox and WebKit too.
